# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Cycle
from plane.utils.cycle_progress import serialize_cycle_progress_series, upsert_cycle_progress


class CycleProgressV2Endpoint(BaseAPIView):
    """Stored per-day progress series for a cycle (the v2 charts).

    Reading an active cycle refreshes today's row live, so the chart is always
    current; past days stay frozen as they were recorded.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, cycle_id):
        cycle = Cycle.objects.filter(workspace__slug=slug, project_id=project_id, pk=cycle_id).first()
        if not cycle:
            return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)
        if not (cycle.start_date and cycle.end_date):
            return Response({"error": "Cycle has no start or end date"}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        if cycle.start_date <= now and cycle.end_date >= now and not cycle.archived_at:
            upsert_cycle_progress(cycle)

        return Response(serialize_cycle_progress_series(cycle), status=status.HTTP_200_OK)
