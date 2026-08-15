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


@shared_task
def record_cycle_progress():
    """Daily: freeze yesterday's end-of-day progress row for every cycle that
    was running yesterday. Opening a cycle in the app refreshes today's row
    live; this task guarantees history even for cycles nobody opens."""
    from plane.db.models import Cycle
    from plane.utils.cycle_progress import upsert_cycle_progress

    yesterday = date.today() - timedelta(days=1)
    now = timezone.now()
    running = Cycle.objects.filter(
        start_date__date__lte=yesterday,
        end_date__date__gte=yesterday,
        archived_at__isnull=True,
    )
    for cycle in running:
        try:
            upsert_cycle_progress(cycle, for_date=yesterday)
        except Exception as e:
            log_exception(e)
            continue
    # Also refresh today's row for currently active cycles so charts stay
    # current even without anyone opening them.
    for cycle in Cycle.objects.filter(start_date__lte=now, end_date__gte=now, archived_at__isnull=True):
        try:
            upsert_cycle_progress(cycle)
        except Exception as e:
            log_exception(e)
            continue
