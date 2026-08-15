# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db.models import Count, Q
from django.utils import timezone

# Third party imports
from rest_framework.permissions import IsAuthenticated

# Module imports
from plane.app.views.base import BaseAPIView
from plane.db.models import Cycle


class WorkspaceActiveCyclesEndpoint(BaseAPIView):
    """Every running cycle across the workspace's projects the user belongs to."""

    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        now = timezone.now()
        active_cycles = (
            Cycle.objects.filter(
                workspace__slug=slug,
                start_date__lte=now,
                end_date__gte=now,
                archived_at__isnull=True,
                project__archived_at__isnull=True,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            )
            .select_related("project", "workspace")
            .annotate(
                total_issues=Count(
                    "issue_cycle__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__deleted_at__isnull=True,
                        issue_cycle__issue__deleted_at__isnull=True,
                    ),
                ),
                completed_issues=Count(
                    "issue_cycle__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_cycle__issue__state__group="completed",
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__deleted_at__isnull=True,
                        issue_cycle__issue__deleted_at__isnull=True,
                    ),
                ),
                started_issues=Count(
                    "issue_cycle__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_cycle__issue__state__group="started",
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__deleted_at__isnull=True,
                        issue_cycle__issue__deleted_at__isnull=True,
                    ),
                ),
                urgent_issues=Count(
                    "issue_cycle__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_cycle__issue__priority="urgent",
                        issue_cycle__issue__state__group__in=["backlog", "unstarted", "started"],
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__deleted_at__isnull=True,
                        issue_cycle__issue__deleted_at__isnull=True,
                    ),
                ),
                high_issues=Count(
                    "issue_cycle__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_cycle__issue__priority="high",
                        issue_cycle__issue__state__group__in=["backlog", "unstarted", "started"],
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__deleted_at__isnull=True,
                        issue_cycle__issue__deleted_at__isnull=True,
                    ),
                ),
            )
            .order_by("end_date", "name")
            .distinct()
        )

        return self.paginate(
            request=request,
            queryset=active_cycles,
            on_results=lambda cycles: [
                {
                    "id": str(cycle.id),
                    "name": cycle.name,
                    "start_date": cycle.start_date,
                    "end_date": cycle.end_date,
                    "version": cycle.version,
                    "project_id": str(cycle.project_id),
                    "project_name": cycle.project.name,
                    "project_identifier": cycle.project.identifier,
                    "project_logo_props": cycle.project.logo_props,
                    "total_issues": cycle.total_issues,
                    "completed_issues": cycle.completed_issues,
                    "started_issues": cycle.started_issues,
                    "urgent_issues": cycle.urgent_issues,
                    "high_issues": cycle.high_issues,
                }
                for cycle in cycles
            ],
            default_per_page=30,
        )
