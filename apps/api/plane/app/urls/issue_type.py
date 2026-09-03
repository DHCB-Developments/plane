# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import IssueTypeViewSet, IssuePropertyViewSet, IssuePropertyValueEndpoint
from plane.app.views.issue_type.library import IssuePropertyLibraryViewSet


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
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/available/",
        IssueTypeViewSet.as_view({"get": "available"}),
        name="project-issue-types-available",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:pk>/import/",
        IssueTypeViewSet.as_view({"post": "import_type"}),
        name="project-issue-type-import",
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
    # ----- property library (workspace level) -----
    path(
        "workspaces/<str:slug>/issue-properties/",
        IssuePropertyLibraryViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-property-library",
    ),
    path(
        "workspaces/<str:slug>/issue-properties/<uuid:pk>/",
        IssuePropertyLibraryViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="issue-property-library-detail",
    ),
    path(
        "workspaces/<str:slug>/issue-properties/<uuid:pk>/impact/",
        IssuePropertyLibraryViewSet.as_view({"get": "impact"}),
        name="issue-property-library-impact",
    ),
    path(
        "workspaces/<str:slug>/issue-properties/<uuid:pk>/duplicate/",
        IssuePropertyLibraryViewSet.as_view({"post": "duplicate"}),
        name="issue-property-library-duplicate",
    ),
    # ----- link preflight -----
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:issue_type_id>/properties/<uuid:pk>/impact/",
        IssuePropertyViewSet.as_view({"get": "impact"}),
        name="issue-type-property-impact",
    ),
]
