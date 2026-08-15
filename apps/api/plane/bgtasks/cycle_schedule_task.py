# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import date, timedelta

# Django imports
from django.utils import timezone

# Third party imports
from celery import shared_task

# Module imports
from plane.utils.exception_logger import log_exception


def _schedule_actor_id(schedule):
    """Owner for generated cycles / actor for rollovers.

    created_by can be None when rows are made outside a request context, so
    fall back to the project's lead, then its creator.
    """
    return (
        schedule.created_by_id
        or schedule.project.project_lead_id
        or schedule.project.created_by_id
    )


def _generate_upcoming_cycles(schedule):
    """Keep `upcoming_count` future cycles created for this schedule."""
    from plane.db.models import Cycle
    from plane.utils.timezone_converter import convert_to_utc

    now = timezone.now()
    future_cycles = Cycle.objects.filter(
        project_id=schedule.project_id, start_date__gt=now
    ).count()

    created = 0
    # Safety bound: never create more than upcoming_count rows in one run.
    while future_cycles + created < schedule.upcoming_count and created < schedule.upcoming_count:
        start = schedule.next_start_date
        # If the pointer fell behind (task downtime), advance it to the future
        # while keeping the configured weekday cadence.
        step = schedule.duration_weeks * 7 + schedule.cooldown_days
        while start <= date.today():
            start = start + timedelta(days=step)
        end = start + timedelta(days=schedule.duration_weeks * 7 - 1)

        start_utc = convert_to_utc(date=start.isoformat(), project_id=schedule.project_id, is_start_date=True)
        end_utc = convert_to_utc(date=end.isoformat(), project_id=schedule.project_id)

        # Respect the no-overlap rule: skip this slot if anything intersects.
        overlapping = Cycle.objects.filter(
            project_id=schedule.project_id,
            start_date__lte=end_utc,
            end_date__gte=start_utc,
        ).exists()
        if not overlapping:
            Cycle.objects.create(
                project_id=schedule.project_id,
                workspace_id=schedule.workspace_id,
                name=f"{schedule.title_prefix} - {schedule.next_sequence}",
                start_date=start_utc,
                end_date=end_utc,
                owned_by_id=_schedule_actor_id(schedule),
            )
            schedule.next_sequence += 1
            created += 1

        schedule.next_start_date = start + timedelta(days=step)
        schedule.save(update_fields=["next_start_date", "next_sequence", "updated_at"])
        if overlapping:
            # Slot occupied by a manual cycle — try the next slot on the next run.
            break


def _rollover_finished_cycles(schedule):
    """Move unfinished work items from cycles that just ended into the next one.

    Reuses the manual transfer path, which also freezes the old cycle's
    progress snapshot — an empty snapshot marks a cycle as not yet processed.
    """
    from plane.db.models import Cycle, CycleIssue
    from plane.utils.cycle_transfer_issues import transfer_cycle_issues

    now = timezone.now()
    ended = Cycle.objects.filter(
        project_id=schedule.project_id,
        end_date__lt=now,
        end_date__gte=now - timedelta(days=7),  # only recently ended; older ones are history
        progress_snapshot={},
        archived_at__isnull=True,
    ).order_by("end_date")

    for cycle in ended:
        has_incomplete = (
            CycleIssue.objects.filter(cycle_id=cycle.id)
            .exclude(issue__state__group__in=["completed", "cancelled"])
            .exists()
        )
        if not has_incomplete:
            continue
        next_cycle = (
            Cycle.objects.filter(
                project_id=schedule.project_id, start_date__gte=cycle.end_date, end_date__gt=now
            )
            .order_by("start_date")
            .first()
        )
        if not next_cycle:
            continue
        result = transfer_cycle_issues(
            slug=schedule.workspace.slug,
            project_id=schedule.project_id,
            cycle_id=cycle.id,
            new_cycle_id=next_cycle.id,
            request=None,
            user_id=str(_schedule_actor_id(schedule)),
        )
        if isinstance(result, dict) and result.get("error"):
            log_exception(Exception(f"cycle rollover failed for {cycle.id}: {result['error']}"))


@shared_task
def schedule_cycles():
    """Daily: create upcoming cycles and roll over finished ones, per project."""
    from plane.db.models import CycleSchedule

    for schedule in CycleSchedule.objects.filter(enabled=True).select_related("workspace", "project"):
        try:
            _generate_upcoming_cycles(schedule)
            if schedule.auto_rollover:
                _rollover_finished_cycles(schedule)
        except Exception as e:
            log_exception(e)
            continue
