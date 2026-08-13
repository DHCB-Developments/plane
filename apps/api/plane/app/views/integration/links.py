# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import GithubBranchLinkSerializer, GithubPullRequestLinkSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import GithubBranchLink, GithubPullRequestLink


class IssueGithubLinksEndpoint(BaseAPIView):
    """Everything GitHub knows about one work item: linked PRs and branches."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        pull_requests = GithubPullRequestLink.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).order_by("-created_at")
        branches = GithubBranchLink.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).order_by("-created_at")
        return Response(
            {
                "pull_requests": GithubPullRequestLinkSerializer(pull_requests, many=True).data,
                "branches": GithubBranchLinkSerializer(branches, many=True).data,
            },
            status=status.HTTP_200_OK,
        )
