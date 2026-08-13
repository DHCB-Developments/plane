# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import datetime, timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import GithubBranchLinkSerializer, GithubPullRequestLinkSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import GithubBranchLink, GithubPullRequestLink, GithubRepository
from plane.utils.integrations.github import GithubApiError, GithubAppNotConfigured, client_for

from .github import get_github_workspace_integration


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

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        """Manually attach a PR: repository (project repo set) + pr_number."""
        repository_pk = request.data.get("repository")
        pr_number = request.data.get("pr_number")
        if not (repository_pk and pr_number):
            return Response(
                {"error": "repository and pr_number are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        workspace_integration = get_github_workspace_integration(slug)
        if not workspace_integration:
            return Response(
                {"error": "GitHub is not connected to this workspace"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            repository = GithubRepository.objects.get(
                pk=repository_pk, workspace__slug=slug, project_id=project_id
            )
        except GithubRepository.DoesNotExist:
            return Response(
                {"error": "Repository is not part of this project"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            client = client_for(workspace_integration)
            pr = client.get_pull_request(repository.owner, repository.name, pr_number)
        except (GithubAppNotConfigured, GithubApiError):
            return Response(
                {"error": "Could not fetch the pull request from GitHub"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if pr.get("merged_at"):
            pr_state = "merged"
        elif pr.get("state") == "closed":
            pr_state = "closed"
        elif pr.get("draft"):
            pr_state = "draft"
        else:
            pr_state = "open"

        link, created = GithubPullRequestLink.objects.get_or_create(
            issue_id=issue_id,
            repository_id=repository.repository_id,
            pr_number=pr.get("number"),
            defaults={
                "project_id": project_id,
                "workspace_id": repository.workspace_id,
                "repo_full_name": f"{repository.owner}/{repository.name}",
                "title": (pr.get("title") or "")[:1000],
                "url": pr.get("html_url") or "",
                "state": pr_state,
                "author": (pr.get("user") or {}).get("login") or "",
                "author_avatar": (pr.get("user") or {}).get("avatar_url") or "",
                "source_branch": (pr.get("head") or {}).get("ref") or "",
                "target_branch": (pr.get("base") or {}).get("ref") or "",
                "link_type": "manual",
                "last_event_at": datetime.now(timezone.utc),
            },
        )
        if not created:
            return Response(
                {"error": "This pull request is already linked to the work item"},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            GithubPullRequestLinkSerializer(link).data, status=status.HTTP_201_CREATED
        )


class IssueGithubLinkDetailEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def delete(self, request, slug, project_id, issue_id, pk):
        link = GithubPullRequestLink.objects.get(
            pk=pk, workspace__slug=slug, project_id=project_id, issue_id=issue_id
        )
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectRepositoryPullRequestsEndpoint(BaseAPIView):
    """Search open PRs in one of the project's repos, for the manual-link picker."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id, pk):
        workspace_integration = get_github_workspace_integration(slug)
        if not workspace_integration:
            return Response(
                {"error": "GitHub is not connected to this workspace"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            repository = GithubRepository.objects.get(pk=pk, workspace__slug=slug, project_id=project_id)
        except GithubRepository.DoesNotExist:
            return Response(
                {"error": "Repository is not part of this project"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            client = client_for(workspace_integration)
            pulls = client.list_pull_requests(
                repository.owner,
                repository.name,
                state=request.GET.get("state", "open"),
                search=request.GET.get("search"),
            )
        except (GithubAppNotConfigured, GithubApiError):
            return Response(
                {"error": "Could not fetch pull requests from GitHub"}, status=status.HTTP_502_BAD_GATEWAY
            )
        return Response(
            [
                {
                    "number": pr.get("number"),
                    "title": pr.get("title"),
                    "state": "draft" if pr.get("draft") else pr.get("state"),
                    "url": pr.get("html_url"),
                    "author": (pr.get("user") or {}).get("login"),
                    "source_branch": (pr.get("head") or {}).get("ref"),
                }
                for pr in pulls
            ],
            status=status.HTTP_200_OK,
        )
