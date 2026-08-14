# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
from django.conf import settings

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkSpaceAdminPermission, WorkspaceEntityPermission
from plane.app.serializers import WorkspaceIntegrationSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import APIToken, Integration, User, Workspace, WorkspaceIntegration
from plane.utils.integrations.github import (
    GithubApiError,
    GithubAppNotConfigured,
    client_for,
    get_installations,
    get_workspace_github_credentials,
    has_workspace_github_credentials,
    store_workspace_github_credentials,
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


def _ensure_workspace_integration(workspace):
    """Get or create the workspace's GitHub integration row with its bot identity."""
    integration, _ = Integration.objects.get_or_create(
        provider=GITHUB_PROVIDER, defaults={"title": "GitHub", "verified": True}
    )
    workspace_integration = WorkspaceIntegration.objects.filter(
        workspace=workspace, integration=integration
    ).first()
    if workspace_integration:
        return workspace_integration
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
    return WorkspaceIntegration.objects.create(
        workspace=workspace,
        integration=integration,
        actor=bot,
        api_token=api_token,
        metadata={},
    )


def _connection_payload(workspace_integration):
    base_url = settings.WEB_URL.rstrip("/") if settings.WEB_URL else ""
    is_configured = bool(workspace_integration and has_workspace_github_credentials(workspace_integration))
    app_slug = None
    if workspace_integration:
        _, app_slug, _, _ = get_workspace_github_credentials(workspace_integration)
    installations = get_installations(workspace_integration) if workspace_integration else []
    return {
        "is_app_configured": is_configured,
        "is_installed": bool(installations),
        "app_slug": app_slug,
        "webhook_url": f"{base_url}/api/webhooks/github/",
        "setup_url": f"{base_url}/github-setup/",
        "installations": installations,
        "connection": (
            WorkspaceIntegrationSerializer(workspace_integration).data
            if workspace_integration and installations
            else None
        ),
    }


class GithubConnectionEndpoint(BaseAPIView):
    """Workspace-level GitHub App connection: status / connect / disconnect."""

    permission_classes = [WorkSpaceAdminPermission]

    def get_permissions(self):
        # Status is read by every member's work item view (the GitHub section
        # gates on it); mutations stay admin-only.
        if self.request.method == "GET":
            return [WorkspaceEntityPermission()]
        return super().get_permissions()

    def get(self, request, slug):
        return Response(
            _connection_payload(get_github_workspace_integration(slug)), status=status.HTTP_200_OK
        )

    def post(self, request, slug):
        """Complete the GitHub App installation: store installation_id for the workspace."""
        installation_id = request.data.get("installation_id")
        if not installation_id:
            return Response(
                {"error": "installation_id is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        workspace_integration = get_github_workspace_integration(slug)
        if not workspace_integration or not has_workspace_github_credentials(workspace_integration):
            return Response(
                {"error": "Save the GitHub App credentials for this workspace first"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        installations = get_installations(workspace_integration)
        if any(str(i.get("installation_id")) == str(installation_id) for i in installations):
            # Re-visited callback for an org that's already connected.
            return Response(_connection_payload(workspace_integration), status=status.HTTP_200_OK)

        try:
            client = client_for(workspace_integration, installation_id=installation_id)
            installation = client.get_installation()
        except GithubAppNotConfigured:
            return Response(
                {"error": "GitHub App credentials are missing for this workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except GithubApiError:
            return Response(
                {"error": "Could not verify the GitHub App installation"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        account = installation.get("account") or {}
        installations.append(
            {
                "installation_id": str(installation_id),
                "account_login": account.get("login"),
                "account_type": account.get("type"),
                "account_avatar_url": account.get("avatar_url"),
            }
        )
        # Normalized shape: the installations list is the source of truth.
        workspace_integration.metadata = {"installations": installations}
        workspace_integration.save(update_fields=["metadata"])

        return Response(_connection_payload(workspace_integration), status=status.HTTP_201_CREATED)

    def delete(self, request, slug):
        workspace_integration = get_github_workspace_integration(slug)
        if not workspace_integration:
            return Response(
                {"error": "GitHub is not connected to this workspace"},
                status=status.HTTP_404_NOT_FOUND,
            )
        installation_id = request.GET.get("installation_id") or request.data.get("installation_id")
        if installation_id:
            remaining = [
                i
                for i in get_installations(workspace_integration)
                if str(i.get("installation_id")) != str(installation_id)
            ]
            workspace_integration.metadata = {"installations": remaining}
            workspace_integration.save(update_fields=["metadata"])
            return Response(_connection_payload(workspace_integration), status=status.HTTP_200_OK)
        workspace_integration.api_token.delete()
        workspace_integration.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GithubCredentialsEndpoint(BaseAPIView):
    """Save / update the workspace's GitHub App credentials (admin-entered)."""

    permission_classes = [WorkSpaceAdminPermission]

    def post(self, request, slug):
        app_id = request.data.get("app_id")
        app_slug = request.data.get("app_slug")
        private_key = request.data.get("private_key")
        webhook_secret = request.data.get("webhook_secret")

        workspace_integration = get_github_workspace_integration(slug)
        is_update = bool(workspace_integration and has_workspace_github_credentials(workspace_integration))
        # On first save everything is required; on update blank secrets mean "keep".
        if not (app_id and app_slug) or (not is_update and not (private_key and webhook_secret)):
            return Response(
                {"error": "app_id, app_slug, private_key and webhook_secret are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if private_key and "PRIVATE KEY" not in private_key:
            return Response(
                {"error": "The private key should be the full PEM file contents"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace = Workspace.objects.get(slug=slug)
        workspace_integration = _ensure_workspace_integration(workspace)
        store_workspace_github_credentials(
            workspace_integration, app_id, app_slug, private_key, webhook_secret
        )
        return Response(_connection_payload(workspace_integration), status=status.HTTP_200_OK)


class GithubInstallationRepositoriesEndpoint(BaseAPIView):
    """The workspace's repo pool: everything the GitHub App installation can see."""

    permission_classes = [WorkSpaceAdminPermission]

    def get(self, request, slug):
        workspace_integration = get_github_workspace_integration(slug)
        installations = get_installations(workspace_integration) if workspace_integration else []
        if not installations:
            return Response(
                {"error": "GitHub is not connected to this workspace"},
                status=status.HTTP_404_NOT_FOUND,
            )
        pool = []
        errors = 0
        for installation in installations:
            try:
                client = client_for(workspace_integration, installation_id=installation["installation_id"])
                for repo in client.list_repositories():
                    pool.append(
                        {
                            "repository_id": repo["id"],
                            "name": repo["name"],
                            "full_name": repo["full_name"],
                            "owner": repo["owner"]["login"],
                            "url": repo["html_url"],
                            "private": repo["private"],
                            "default_branch": repo.get("default_branch"),
                            "account": installation.get("account_login"),
                        }
                    )
            except (GithubAppNotConfigured, GithubApiError):
                errors += 1
        if errors and not pool:
            return Response(
                {"error": "Could not fetch repositories from GitHub"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(pool, status=status.HTTP_200_OK)
