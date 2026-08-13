# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.integration import (
    GithubConnectionEndpoint,
    GithubCredentialsEndpoint,
    GithubInstallationRepositoriesEndpoint,
    IssueGithubLinkDetailEndpoint,
    IssueGithubLinksEndpoint,
    ProjectGithubRepositoryViewSet,
    ProjectGithubSettingsEndpoint,
    ProjectRepositoryPullRequestsEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/integrations/github/",
        GithubConnectionEndpoint.as_view(),
        name="github-connection",
    ),
    path(
        "workspaces/<str:slug>/integrations/github/credentials/",
        GithubCredentialsEndpoint.as_view(),
        name="github-credentials",
    ),
    path(
        "workspaces/<str:slug>/integrations/github/repositories/",
        GithubInstallationRepositoriesEndpoint.as_view(),
        name="github-installation-repositories",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/github-repositories/",
        ProjectGithubRepositoryViewSet.as_view({"get": "list", "post": "create"}),
        name="project-github-repositories",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/github-repositories/<uuid:pk>/",
        ProjectGithubRepositoryViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="project-github-repository-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/github-links/",
        IssueGithubLinksEndpoint.as_view(),
        name="issue-github-links",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/github-links/<uuid:pk>/",
        IssueGithubLinkDetailEndpoint.as_view(),
        name="issue-github-link-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/github-repositories/<uuid:pk>/pull-requests/",
        ProjectRepositoryPullRequestsEndpoint.as_view(),
        name="project-github-repository-pull-requests",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/github-settings/",
        ProjectGithubSettingsEndpoint.as_view(),
        name="project-github-settings",
    ),
]
