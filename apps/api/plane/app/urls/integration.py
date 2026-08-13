# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.integration import (
    GithubConnectionEndpoint,
    GithubInstallationRepositoriesEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/integrations/github/",
        GithubConnectionEndpoint.as_view(),
        name="github-connection",
    ),
    path(
        "workspaces/<str:slug>/integrations/github/repositories/",
        GithubInstallationRepositoriesEndpoint.as_view(),
        name="github-installation-repositories",
    ),
]
