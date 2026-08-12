# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import datetime

# Django imports
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseViewSet, BaseAPIView
from plane.app.serializers import IssuePropertySerializer
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import (
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    ProjectIssueType,
    Project,
    Issue,
    PropertyTypeEnum,
)


def _parse_datetime(raw_value):
    # Accept "YYYY-MM-DD" (from the date picker) or a full ISO datetime; return an
    # aware datetime so Django doesn't warn about naive datetimes.
    if raw_value in (None, ""):
        return None
    if not isinstance(raw_value, str):
        return raw_value
    parsed = parse_datetime(raw_value)
    if parsed is None:
        date_only = parse_date(raw_value)
        if date_only is not None:
            parsed = datetime.combine(date_only, datetime.min.time())
    if parsed is not None and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def _to_bool(raw_value):
    # The frontend sends booleans as the strings "true"/"false"; guard against
    # Python's truthiness (bool("false") is True).
    if isinstance(raw_value, bool):
        return raw_value
    return str(raw_value).strip().lower() in ("true", "1", "yes")


def build_value_kwargs(prop, raw_value):
    """Map a raw value to the correct IssuePropertyValue column for the property type."""
    kwargs = {}
    ptype = prop.property_type
    if ptype in (PropertyTypeEnum.TEXT, PropertyTypeEnum.URL):
        kwargs["value_text"] = str(raw_value) if raw_value is not None else None
    elif ptype == PropertyTypeEnum.DECIMAL:
        kwargs["value_decimal"] = raw_value
    elif ptype == PropertyTypeEnum.BOOLEAN:
        kwargs["value_boolean"] = _to_bool(raw_value)
    elif ptype == PropertyTypeEnum.DATETIME:
        kwargs["value_datetime"] = _parse_datetime(raw_value)
    elif ptype == PropertyTypeEnum.RELATION:
        kwargs["value_uuid"] = raw_value
    elif ptype == PropertyTypeEnum.OPTION:
        kwargs["value_option_id"] = raw_value
    return kwargs


def extract_value(value):
    """Return the populated value for an IssuePropertyValue row as a string.

    Values are typed columns in the DB but the frontend contract is
    Record<property_id, string[]>, so everything is stringified consistently.
    """
    ptype = value.property.property_type
    if ptype in (PropertyTypeEnum.TEXT, PropertyTypeEnum.URL):
        return value.value_text
    if ptype == PropertyTypeEnum.DECIMAL:
        return str(value.value_decimal) if value.value_decimal is not None else None
    if ptype == PropertyTypeEnum.BOOLEAN:
        return "true" if value.value_boolean else "false"
    if ptype == PropertyTypeEnum.DATETIME:
        return value.value_datetime.isoformat() if value.value_datetime else None
    if ptype == PropertyTypeEnum.RELATION:
        return str(value.value_uuid) if value.value_uuid else None
    if ptype == PropertyTypeEnum.OPTION:
        return str(value.value_option_id) if value.value_option_id else None
    return None


def visible_properties(issue_type_id, project_id):
    """Properties of a type visible in a project: workspace-shared + that project's own."""
    return IssueProperty.objects.filter(issue_type_id=issue_type_id).filter(
        Q(project__isnull=True) | Q(project_id=project_id)
    )


def missing_required_property_values(issue_type_id, values_map, project_id=None):
    """Return the display names of active, required properties on the type that have no value.

    Used for server-side mandatory enforcement wherever the type and its values are known
    together (e.g. intake create, external API). An empty list means validation passed.
    """
    if not issue_type_id:
        return []
    values_map = values_map or {}

    def _is_empty(values):
        if values in (None, ""):
            return True
        if isinstance(values, list):
            return len(values) == 0 or all(v in (None, "") for v in values)
        return False

    return [
        prop.display_name
        for prop in visible_properties(issue_type_id, project_id).filter(is_active=True, is_required=True)
        if _is_empty(values_map.get(str(prop.id)))
    ]


def set_issue_property_values(issue, values_map, actor):
    """Write custom property values for an issue from a {property_id: [values]} map.

    Only properties that belong to the issue's (active) type are written; single-select
    properties are capped to one value; empty values are skipped. Existing values for
    each supplied property are replaced. Caller is responsible for the transaction.
    Shared by IssuePropertyValueEndpoint and the intake create flow.
    """
    if not values_map or not getattr(issue, "type_id", None):
        return
    type_properties = {
        str(p.id): p for p in visible_properties(issue.type_id, issue.project_id).filter(is_active=True)
    }
    for prop_id, raw_values in values_map.items():
        prop = type_properties.get(str(prop_id))
        if prop is None:
            continue
        if not isinstance(raw_values, list):
            raw_values = [raw_values]
        if not prop.is_multi:
            raw_values = raw_values[:1]
        IssuePropertyValue.objects.filter(issue_id=issue.id, property_id=prop.id).delete()
        for raw_value in raw_values:
            if raw_value in (None, ""):
                continue
            IssuePropertyValue.objects.create(
                issue_id=issue.id,
                property=prop,
                project_id=issue.project_id,
                workspace_id=issue.workspace_id,
                created_by=actor,
                updated_by=actor,
                **build_value_kwargs(prop, raw_value),
            )


class IssuePropertyViewSet(BaseViewSet):
    serializer_class = IssuePropertySerializer
    model = IssueProperty

    def get_queryset(self):
        return (
            IssueProperty.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                issue_type_id=self.kwargs.get("issue_type_id"),
            )
            # Scope: workspace-shared properties + this project's own.
            .filter(Q(project__isnull=True) | Q(project_id=self.kwargs.get("project_id")))
            .prefetch_related("options")
            .order_by("sort_order")
        )

    def _validate_type_in_project(self, slug, project_id, issue_type_id):
        return ProjectIssueType.objects.filter(
            project_id=project_id, issue_type_id=issue_type_id, deleted_at__isnull=True
        ).exists()

    def _sync_options(self, property_obj, options, actor):
        existing = {str(o.id): o for o in property_obj.options.filter(deleted_at__isnull=True)}
        seen = set()
        for idx, opt in enumerate(options or []):
            oid = str(opt.get("id")) if opt.get("id") else None
            data = {
                "name": opt.get("name", ""),
                "description": opt.get("description", ""),
                "logo_props": opt.get("logo_props", {}),
                "is_active": opt.get("is_active", True),
                "is_default": opt.get("is_default", False),
                "sort_order": (idx + 1) * 10000,
            }
            if oid and oid in existing:
                obj = existing[oid]
                for key, val in data.items():
                    setattr(obj, key, val)
                obj.updated_by = actor
                obj.save()
                seen.add(oid)
            else:
                IssuePropertyOption.objects.create(
                    property=property_obj,
                    workspace=property_obj.workspace,
                    project=property_obj.project,
                    created_by=actor,
                    updated_by=actor,
                    **data,
                )
        for oid, obj in existing.items():
            if oid not in seen:
                obj.delete()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, issue_type_id):
        return Response(IssuePropertySerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, issue_type_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self._validate_type_in_project(slug, project_id, issue_type_id):
            return Response({"error": "Work item type not found in project"}, status=status.HTTP_404_NOT_FOUND)

        options = request.data.get("options", [])
        is_project_scoped = bool(request.data.get("is_project_scoped", False))
        serializer = IssuePropertySerializer(
            data=request.data, context={"project_id": project_id, "issue_type_id": issue_type_id}
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        if serializer.validated_data.get("property_type") == PropertyTypeEnum.OPTION and not options:
            return Response(
                {"options": "A dropdown property needs at least one option"}, status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            prop = serializer.save(
                issue_type_id=issue_type_id,
                workspace_id=project.workspace_id,
                # NULL project = shared across every project using the type;
                # set = visible only in this project.
                project_id=project_id if is_project_scoped else None,
                created_by=request.user,
                updated_by=request.user,
            )
            if prop.property_type == PropertyTypeEnum.OPTION:
                self._sync_options(prop, options, request.user)

        instance = self.get_queryset().get(pk=prop.pk)
        return Response(IssuePropertySerializer(instance).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, issue_type_id, pk):
        prop = self.get_queryset().filter(pk=pk).first()
        if prop is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)

        # Scope transitions (shared <-> only-this-project), guarded both ways.
        if "is_project_scoped" in request.data:
            want_local = bool(request.data.get("is_project_scoped"))
            is_local = prop.project_id is not None
            if want_local != is_local:
                if want_local:
                    # shared -> local would orphan values on other projects' work items.
                    other_values = (
                        IssuePropertyValue.objects.filter(property=prop).exclude(project_id=project_id).count()
                    )
                    if other_values:
                        return Response(
                            {
                                "error": f"Cannot scope to this project: {other_values} value(s) exist on work "
                                "items in other projects. Clear them first."
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    prop.project_id = project_id
                else:
                    # local -> shared: the name must be free across the whole type
                    # (any other shared or project-local property would collide in
                    # someone's visible set).
                    name_clash = (
                        IssueProperty.objects.filter(
                            issue_type_id=prop.issue_type_id,
                            display_name__iexact=prop.display_name,
                            deleted_at__isnull=True,
                        )
                        .exclude(pk=prop.pk)
                        .exists()
                    )
                    if name_clash:
                        return Response(
                            {
                                "error": "Cannot share: a property with this name already exists on this type "
                                "in another project."
                            },
                            status=status.HTTP_400_BAD_REQUEST,
                        )
                    prop.project_id = None
                prop.updated_by = request.user
                prop.save(update_fields=["project", "workspace", "updated_by", "updated_at"])
                # Options follow the property's scope.
                prop.options.filter(deleted_at__isnull=True).update(project_id=prop.project_id)

        serializer = IssuePropertySerializer(
            prop,
            data=request.data,
            partial=True,
            context={"project_id": project_id, "issue_type_id": issue_type_id},
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            prop = serializer.save(updated_by=request.user)
            if "options" in request.data and prop.property_type == PropertyTypeEnum.OPTION:
                self._sync_options(prop, request.data.get("options", []), request.user)

        instance = self.get_queryset().get(pk=pk)
        return Response(IssuePropertySerializer(instance).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, issue_type_id, pk):
        prop = self.get_queryset().filter(pk=pk).first()
        if prop is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        prop.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class IssuePropertyValueEndpoint(BaseAPIView):
    def _serialize_values(self, slug, project_id, issue_id):
        values = IssuePropertyValue.objects.filter(
            workspace__slug=slug, project_id=project_id, issue_id=issue_id
        ).select_related("property")
        result = {}
        for value in values:
            result.setdefault(str(value.property_id), []).append(extract_value(value))
        return result

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id):
        return Response(self._serialize_values(slug, project_id, issue_id), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id, issue_id):
        issue = Issue.objects.filter(pk=issue_id, workspace__slug=slug, project_id=project_id).first()
        if issue is None:
            return Response({"error": "Work item not found"}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            set_issue_property_values(issue, request.data, request.user)

        return Response(self._serialize_values(slug, project_id, issue_id), status=status.HTTP_200_OK)
