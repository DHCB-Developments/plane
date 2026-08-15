# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import date as date_cls

# Django imports
from django.db.models import Case, Count, FloatField, Q, Sum, Value, When
from django.db.models.functions import Cast


def compute_cycle_day_counts(cycle):
    """Current issue-state counts and estimate-point sums for a cycle."""
    from plane.db.models import Issue

    base = Issue.issue_objects.filter(
        issue_cycle__cycle_id=cycle.id,
        issue_cycle__deleted_at__isnull=True,
        project_id=cycle.project_id,
    )
    counts = base.aggregate(
        scope=Count("id"),
        completed=Count("id", filter=Q(state__group="completed")),
        backlog=Count("id", filter=Q(state__group="backlog")),
        unstarted=Count("id", filter=Q(state__group="unstarted")),
        started=Count("id", filter=Q(state__group="started")),
        cancelled=Count("id", filter=Q(state__group="cancelled")),
    )
    points = (
        base.filter(estimate_point__estimate__type="points")
        .annotate(value_as_float=Cast("estimate_point__value", FloatField()))
        .aggregate(
            total_estimate_points=Sum("value_as_float", default=Value(0), output_field=FloatField()),
            completed_estimate_points=Sum(
                Case(When(state__group="completed", then="value_as_float"), default=Value(0), output_field=FloatField())
            ),
            backlog_estimate_points=Sum(
                Case(When(state__group="backlog", then="value_as_float"), default=Value(0), output_field=FloatField())
            ),
            unstarted_estimate_points=Sum(
                Case(When(state__group="unstarted", then="value_as_float"), default=Value(0), output_field=FloatField())
            ),
            started_estimate_points=Sum(
                Case(When(state__group="started", then="value_as_float"), default=Value(0), output_field=FloatField())
            ),
            cancelled_estimate_points=Sum(
                Case(When(state__group="cancelled", then="value_as_float"), default=Value(0), output_field=FloatField())
            ),
        )
    )
    return {**counts, **{key: value or 0 for key, value in points.items()}}


def upsert_cycle_progress(cycle, for_date=None):
    """Freeze (or refresh) the progress row for a cycle on a given date, and
    mark the cycle as version 2 so clients use the stored series."""
    from plane.db.models import Cycle, CycleProgress

    for_date = for_date or date_cls.today()
    counts = compute_cycle_day_counts(cycle)
    row, created = CycleProgress.objects.update_or_create(
        cycle=cycle,
        date=for_date,
        defaults={
            "project_id": cycle.project_id,
            "workspace_id": cycle.workspace_id,
            **counts,
        },
    )
    if cycle.version != 2:
        Cycle.objects.filter(pk=cycle.pk).update(version=2)
        cycle.version = 2
    return row


def serialize_cycle_progress_series(cycle):
    """The full per-day series for the charts.

    One row per calendar day from cycle start to cycle end. Recorded days carry
    real values; future days carry only the ideal line. `pending`/`actual`
    mirror the TProgressChartData contract.
    """
    from datetime import timedelta

    rows = {row.date: row for row in cycle.daily_progress.all()}
    if not (cycle.start_date and cycle.end_date):
        return []

    start = cycle.start_date.date()
    end = cycle.end_date.date()
    total_days = max((end - start).days, 1)
    today = date_cls.today()

    # Ideal burns the latest known scope down evenly across the cycle.
    latest = None
    for day_offset in range(total_days + 1):
        day = start + timedelta(days=day_offset)
        if day in rows:
            latest = rows[day]
    latest_scope = latest.scope if latest else 0
    latest_scope_points = latest.total_estimate_points if latest else 0

    series = []
    for day_offset in range(total_days + 1):
        day = start + timedelta(days=day_offset)
        remaining_ratio = 1 - (day_offset / total_days)
        row = rows.get(day)
        entry = {
            "date": day.isoformat(),
            "ideal": round(latest_scope * remaining_ratio, 2),
            "ideal_points": round(latest_scope_points * remaining_ratio, 2),
        }
        if row and day <= today:
            entry.update(
                {
                    "scope": row.scope,
                    "completed": row.completed,
                    "backlog": row.backlog,
                    "unstarted": row.unstarted,
                    "started": row.started,
                    "cancelled": row.cancelled,
                    "pending": max(row.scope - row.completed - row.cancelled, 0),
                    "actual": row.completed,
                    "total_estimate_points": row.total_estimate_points,
                    "completed_estimate_points": row.completed_estimate_points,
                    "pending_points": max(
                        row.total_estimate_points - row.completed_estimate_points - row.cancelled_estimate_points, 0
                    ),
                }
            )
        else:
            entry.update(
                {
                    "scope": None,
                    "completed": None,
                    "backlog": None,
                    "unstarted": None,
                    "started": None,
                    "cancelled": None,
                    "pending": None,
                    "actual": None,
                    "total_estimate_points": None,
                    "completed_estimate_points": None,
                    "pending_points": None,
                }
            )
        series.append(entry)
    return series
