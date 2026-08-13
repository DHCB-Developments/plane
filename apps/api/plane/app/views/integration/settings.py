# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import GithubProjectSettings, State

AUTOMATION_KEYS = ("draft_pr", "open_pr", "pr_approved", "pr_merged", "pr_closed")


def _serialize(settings_row):
    return {
        "id": str(settings_row.id),
        "project": str(settings_row.project_id),
        "automation": {key: settings_row.automation.get(key) for key in AUTOMATION_KEYS},
        "branch_format": settings_row.branch_format,
    }


class ProjectGithubSettingsEndpoint(BaseAPIView):
    """Per-project automation mapping: PR lifecycle event -> work item state."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        settings_row = GithubProjectSettings.objects.filter(
            workspace__slug=slug, project_id=project_id
        ).first()
        if not settings_row:
            # Seed a sensible default: merged PRs complete the item.
            default_done = State.objects.filter(
                project_id=project_id, group="completed", default=True
            ).first() or State.objects.filter(project_id=project_id, group="completed").first()
            settings_row = GithubProjectSettings.objects.create(
                project_id=project_id,
                automation={"pr_merged": str(default_done.id) if default_done else None},
            )
        return Response(_serialize(settings_row), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id):
        settings_row = GithubProjectSettings.objects.filter(
            workspace__slug=slug, project_id=project_id
        ).first()
        if not settings_row:
            settings_row = GithubProjectSettings.objects.create(project_id=project_id)

        automation = request.data.get("automation")
        if automation is not None:
            cleaned = dict(settings_row.automation)
            for key in AUTOMATION_KEYS:
                if key in automation:
                    value = automation.get(key)
                    if value and not State.objects.filter(pk=value, project_id=project_id).exists():
                        return Response(
                            {"error": f"State for '{key}' does not belong to this project"},
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    cleaned[key] = str(value) if value else None
            settings_row.automation = cleaned

        if "branch_format" in request.data:
            settings_row.branch_format = request.data.get("branch_format") or ""

        settings_row.save()
        return Response(_serialize(settings_row), status=status.HTTP_200_OK)
