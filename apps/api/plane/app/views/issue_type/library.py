# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.db.models import Count, Q

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, WorkspaceEntityPermission, WorkSpaceAdminPermission, allow_permission
from plane.app.serializers import IssuePropertySerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import (
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    IssueTypeProperty,
    ProjectMember,
    PropertyTypeEnum,
    Workspace,
    WorkspaceMember,
)

from .property import sync_property_options


def _usage(prop):
    """Where a definition is attached: [{project, project_identifier, issue_type, issue_type_name, values}]."""
    links = IssueTypeProperty.objects.filter(property=prop).select_related("project", "issue_type")
    usage = []
    for link in links:
        usage.append(
            {
                "link_id": str(link.id),
                "project_id": str(link.project_id),
                "project_identifier": link.project.identifier,
                "project_name": link.project.name,
                "issue_type_id": str(link.issue_type_id),
                "issue_type_name": link.issue_type.name,
                "values": IssuePropertyValue.objects.filter(property=prop, project_id=link.project_id)
                .values("issue_id")
                .distinct()
                .count(),
            }
        )
    return usage


def _is_workspace_admin(user, slug):
    return WorkspaceMember.objects.filter(
        member=user, workspace__slug=slug, role=ROLE.ADMIN.value, is_active=True
    ).exists()


def _admin_project_ids(user, slug):
    return set(
        ProjectMember.objects.filter(
            member=user, workspace__slug=slug, role=ROLE.ADMIN.value, is_active=True
        ).values_list("project_id", flat=True)
    )


class IssuePropertyLibraryViewSet(BaseViewSet):
    """The workspace property library: definitions independent of any type.

    Project admins may create definitions and edit/delete ones used only in
    projects they administer; touching a definition used elsewhere requires a
    workspace admin, because the change is visible across projects.
    """

    serializer_class = IssuePropertySerializer
    model = IssueProperty

    def get_permissions(self):
        if self.request.method == "GET":
            return [WorkspaceEntityPermission()]
        # Writers must at least be a project admin somewhere (checked per-object below).
        return [WorkspaceEntityPermission()]

    def get_queryset(self):
        return (
            IssueProperty.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .prefetch_related("options")
            .annotate(
                links_count=Count("type_links", filter=Q(type_links__deleted_at__isnull=True), distinct=True),
                projects_count=Count(
                    "type_links__project",
                    filter=Q(type_links__deleted_at__isnull=True),
                    distinct=True,
                ),
            )
            .order_by("display_name", "created_at")
        )

    def _may_write(self, request, slug, prop=None):
        if _is_workspace_admin(request.user, slug):
            return True
        admin_projects = _admin_project_ids(request.user, slug)
        if not admin_projects:
            return False
        if prop is None:
            return True
        used_in = set(IssueTypeProperty.objects.filter(property=prop).values_list("project_id", flat=True))
        # Untouched by other projects, or every using project is one they administer.
        return used_in <= admin_projects

    def list(self, request, slug):
        include_archived = request.GET.get("archived") == "true"
        queryset = self.get_queryset()
        if not include_archived:
            queryset = queryset.filter(is_archived=False)
        props = list(queryset)
        for prop in props:
            prop.usage = _usage(prop)
        return Response(IssuePropertySerializer(props, many=True).data, status=status.HTTP_200_OK)

    def create(self, request, slug):
        if not self._may_write(request, slug):
            return Response({"error": "You don't have permission to create properties"}, status=status.HTTP_403_FORBIDDEN)
        workspace = Workspace.objects.get(slug=slug)
        options = request.data.get("options", [])
        serializer = IssuePropertySerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        if serializer.validated_data.get("property_type") == PropertyTypeEnum.OPTION and not options:
            return Response(
                {"options": "A dropdown property needs at least one option"}, status=status.HTTP_400_BAD_REQUEST
            )
        with transaction.atomic():
            prop = serializer.save(workspace_id=workspace.id, created_by=request.user, updated_by=request.user)
            if prop.property_type == PropertyTypeEnum.OPTION:
                sync_property_options(prop, options, request.user)
        prop = self.get_queryset().get(pk=prop.pk)
        prop.usage = []
        return Response(IssuePropertySerializer(prop).data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, pk):
        prop = self.get_queryset().filter(pk=pk).first()
        if prop is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self._may_write(request, slug, prop):
            return Response(
                {"error": "This property is used in other projects — only a workspace admin can change it."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = IssuePropertySerializer(prop, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            prop = serializer.save(updated_by=request.user)
            if "is_archived" in request.data:
                prop.is_archived = bool(request.data.get("is_archived"))
                prop.save(update_fields=["is_archived", "updated_at"])
            if "options" in request.data and prop.property_type == PropertyTypeEnum.OPTION:
                sync_property_options(prop, request.data.get("options", []), request.user)
        prop = self.get_queryset().get(pk=pk)
        prop.usage = _usage(prop)
        return Response(IssuePropertySerializer(prop).data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, pk):
        """Delete everywhere: detaches from every type and deletes all values."""
        prop = self.get_queryset().filter(pk=pk).first()
        if prop is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self._may_write(request, slug, prop):
            return Response(
                {"error": "This property is used in other projects — only a workspace admin can delete it."},
                status=status.HTTP_403_FORBIDDEN,
            )
        with transaction.atomic():
            IssuePropertyValue.objects.filter(property=prop).delete()
            for link in IssueTypeProperty.objects.filter(property=prop):
                link.delete()
            prop.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def impact(self, request, slug, pk):
        """Preflight for delete/rename prompts."""
        prop = self.get_queryset().filter(pk=pk).first()
        if prop is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        usage = _usage(prop)
        return Response(
            {
                "usage": usage,
                "total_values": sum(u["values"] for u in usage),
                "requires_workspace_admin": not self._may_write(request, slug, prop),
            },
            status=status.HTTP_200_OK,
        )

    def duplicate(self, request, slug, pk):
        """Copy a definition (with options) as an unattached template."""
        if not self._may_write(request, slug):
            return Response({"error": "You don't have permission to create properties"}, status=status.HTTP_403_FORBIDDEN)
        source = self.get_queryset().filter(pk=pk).first()
        if source is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            copy = IssueProperty.objects.create(
                workspace_id=source.workspace_id,
                display_name=request.data.get("display_name") or f"{source.display_name} (copy)",
                description=source.description,
                logo_props=source.logo_props,
                property_type=source.property_type,
                relation_type=source.relation_type,
                is_required=source.is_required,
                is_active=True,
                is_multi=source.is_multi,
                default_value=list(source.default_value or []),
                settings=dict(source.settings or {}),
                created_by=request.user,
                updated_by=request.user,
            )
            for option in source.options.filter(deleted_at__isnull=True).order_by("sort_order"):
                IssuePropertyOption.objects.create(
                    property=copy,
                    workspace_id=copy.workspace_id,
                    name=option.name,
                    description=option.description,
                    logo_props=option.logo_props,
                    is_active=option.is_active,
                    is_default=option.is_default,
                    sort_order=option.sort_order,
                    created_by=request.user,
                    updated_by=request.user,
                )
        copy = self.get_queryset().get(pk=copy.pk)
        copy.usage = []
        return Response(IssuePropertySerializer(copy).data, status=status.HTTP_201_CREATED)
