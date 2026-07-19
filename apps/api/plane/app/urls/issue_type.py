# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import IssueTypeViewSet, IssuePropertyViewSet, IssuePropertyValueEndpoint


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/",
        IssueTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-types",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/enable/",
        IssueTypeViewSet.as_view({"post": "enable"}),
        name="project-issue-types-enable",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:pk>/",
        IssueTypeViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="project-issue-type",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:pk>/mark-default/",
        IssueTypeViewSet.as_view({"post": "mark_as_default"}),
        name="project-issue-type-mark-default",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:issue_type_id>/properties/",
        IssuePropertyViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-type-properties",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:issue_type_id>/properties/<uuid:pk>/",
        IssuePropertyViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="issue-type-property",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/issue-property-values/",
        IssuePropertyValueEndpoint.as_view(),
        name="issue-property-values",
    ),
]
