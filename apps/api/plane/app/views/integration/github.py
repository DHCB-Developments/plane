# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkSpaceAdminPermission
from plane.app.serializers import WorkspaceIntegrationSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import APIToken, Integration, User, Workspace, WorkspaceIntegration
from plane.utils.integrations.github import (
    GithubApiError,
    GithubAppClient,
    GithubAppNotConfigured,
    get_github_app_config,
    is_github_app_configured,
)

GITHUB_PROVIDER = "github"


def get_github_workspace_integration(workspace_slug):
    return (
        WorkspaceIntegration.objects.filter(
            workspace__slug=workspace_slug, integration__provider=GITHUB_PROVIDER
        )
        .select_related("integration", "workspace")
        .first()
    )


class GithubConnectionEndpoint(BaseAPIView):
    """Workspace-level GitHub App connection: status / connect / disconnect."""

    permission_classes = [WorkSpaceAdminPermission]

    def get(self, request, slug):
        _, app_slug, _, _ = get_github_app_config()
        workspace_integration = get_github_workspace_integration(slug)
        return Response(
            {
                "is_app_configured": is_github_app_configured(),
                "app_slug": app_slug,
                "connection": (
                    WorkspaceIntegrationSerializer(workspace_integration).data
                    if workspace_integration
                    else None
                ),
            },
            status=status.HTTP_200_OK,
        )

    def post(self, request, slug):
        """Complete the GitHub App installation: store installation_id for the workspace."""
        installation_id = request.data.get("installation_id")
        if not installation_id:
            return Response(
                {"error": "installation_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        if get_github_workspace_integration(slug):
            return Response(
                {"error": "GitHub is already connected to this workspace"},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            client = GithubAppClient(installation_id)
            installation = client.get_installation()
        except GithubAppNotConfigured:
            return Response(
                {"error": "GitHub App credentials are not configured on this instance"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except GithubApiError:
            return Response(
                {"error": "Could not verify the GitHub App installation"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace = Workspace.objects.get(slug=slug)
        account = installation.get("account") or {}

        integration, _ = Integration.objects.get_or_create(
            provider=GITHUB_PROVIDER, defaults={"title": "GitHub", "verified": True}
        )

        # Bot identity that owns integration-driven activity (comments, transitions).
        bot = User.objects.create(
            username=uuid.uuid4().hex,
            email=f"github-bot-{workspace.id}@bots.plane.internal",
            first_name="GitHub",
            last_name="Bot",
            is_bot=True,
            is_password_autoset=True,
        )
        api_token = APIToken.objects.create(
            user=bot, user_type=1, is_service=True, workspace=workspace, label="GitHub integration bot"
        )

        workspace_integration = WorkspaceIntegration.objects.create(
            workspace=workspace,
            integration=integration,
            actor=bot,
            api_token=api_token,
            metadata={
                "installation_id": str(installation_id),
                "account_login": account.get("login"),
                "account_type": account.get("type"),
                "account_avatar_url": account.get("avatar_url"),
            },
        )

        return Response(
            WorkspaceIntegrationSerializer(workspace_integration).data,
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request, slug):
        workspace_integration = get_github_workspace_integration(slug)
        if not workspace_integration:
            return Response(
                {"error": "GitHub is not connected to this workspace"},
                status=status.HTTP_404_NOT_FOUND,
            )
        workspace_integration.api_token.delete()
        workspace_integration.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GithubInstallationRepositoriesEndpoint(BaseAPIView):
    """The workspace's repo pool: everything the GitHub App installation can see."""

    permission_classes = [WorkSpaceAdminPermission]

    def get(self, request, slug):
        workspace_integration = get_github_workspace_integration(slug)
        if not workspace_integration:
            return Response(
                {"error": "GitHub is not connected to this workspace"},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            client = GithubAppClient(workspace_integration.metadata.get("installation_id"))
            repositories = client.list_repositories()
        except (GithubAppNotConfigured, GithubApiError):
            return Response(
                {"error": "Could not fetch repositories from GitHub"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            [
                {
                    "repository_id": repo["id"],
                    "name": repo["name"],
                    "full_name": repo["full_name"],
                    "owner": repo["owner"]["login"],
                    "url": repo["html_url"],
                    "private": repo["private"],
                    "default_branch": repo.get("default_branch"),
                }
                for repo in repositories
            ],
            status=status.HTTP_200_OK,
        )
