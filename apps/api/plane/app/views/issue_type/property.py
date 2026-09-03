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
    IssueTypeProperty,
    WorkspaceMember,
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


def visible_properties(issue_type_id, project_id, include_inactive=True):
    """Properties attached to a type in a project, with link settings overlaid.

    Returns IssueProperty objects whose is_required / is_active / default_value /
    sort_order reflect the (project, type) link rather than the library
    definition, plus `link_id`. Archived definitions are excluded.
    """
    links = (
        IssueTypeProperty.objects.filter(
            issue_type_id=issue_type_id, project_id=project_id, property__is_archived=False
        )
        .select_related("property")
        .prefetch_related("property__options")
        .order_by("sort_order")
    )
    result = []
    for link in links:
        if not include_inactive and not link.is_active:
            continue
        prop = link.property
        prop.link_id = link.id
        prop.is_required = link.is_required
        prop.is_active = link.is_active
        prop.default_value = link.default_value
        prop.sort_order = link.sort_order
        result.append(prop)
    return result


def missing_required_property_values(issue_type_id, values_map, project_id=None):
    """Display names of active, required properties on the type that have no value.
    An empty list means validation passed."""
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
        for prop in visible_properties(issue_type_id, project_id, include_inactive=False)
        if prop.is_required and _is_empty(values_map.get(str(prop.id)))
    ]


def set_issue_property_values(issue, values_map, actor):
    """Write custom property values for an issue from a {property_id: [values]} map.
    Only properties attached (and active) to the issue's type in its project are written."""
    if not values_map or not getattr(issue, "type_id", None):
        return
    type_properties = {
        str(p.id): p for p in visible_properties(issue.type_id, issue.project_id, include_inactive=False)
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


def sync_property_options(property_obj, options, actor):
    """Create / update / remove dropdown options to match the submitted list."""
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
                created_by=actor,
                updated_by=actor,
                **data,
            )
    for oid, obj in existing.items():
        if oid not in seen:
            obj.delete()


def clear_link_values(link):
    """Delete this project's values for the linked property (used on detach)."""
    return IssuePropertyValue.objects.filter(property_id=link.property_id, project_id=link.project_id).delete()


def _used_outside_project(prop, project_id):
    return IssueTypeProperty.objects.filter(property=prop).exclude(project_id=project_id).exists()


def _is_workspace_admin(user, slug):
    return WorkspaceMember.objects.filter(
        member=user, workspace__slug=slug, role=ROLE.ADMIN.value, is_active=True
    ).exists()


class IssuePropertyViewSet(BaseViewSet):
    """Properties attached to a work item type in a project (the links).
    `pk` in the routes is the PROPERTY id; the link resolves from (project, type, property)."""

    serializer_class = IssuePropertySerializer
    model = IssueProperty

    def _validate_type_in_project(self, slug, project_id, issue_type_id):
        return ProjectIssueType.objects.filter(
            project_id=project_id, issue_type_id=issue_type_id, deleted_at__isnull=True
        ).exists()

    def _get_link(self, project_id, issue_type_id, property_id):
        return IssueTypeProperty.objects.filter(
            project_id=project_id, issue_type_id=issue_type_id, property_id=property_id
        ).first()

    def _linked(self, issue_type_id, project_id, property_id):
        return next(p for p in visible_properties(issue_type_id, project_id) if str(p.id) == str(property_id))

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, issue_type_id):
        return Response(
            IssuePropertySerializer(visible_properties(issue_type_id, project_id), many=True).data,
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id, issue_type_id):
        """Attach: {"property_id"} links an existing definition; a full payload
        creates the definition in the library and links it in one step."""
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if not self._validate_type_in_project(slug, project_id, issue_type_id):
            return Response({"error": "Work item type not found in project"}, status=status.HTTP_404_NOT_FOUND)

        property_id = request.data.get("property_id")
        with transaction.atomic():
            if property_id:
                prop = IssueProperty.objects.filter(pk=property_id, workspace__slug=slug, is_archived=False).first()
                if prop is None:
                    return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
            else:
                options = request.data.get("options", [])
                serializer = IssuePropertySerializer(data=request.data)
                if not serializer.is_valid():
                    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
                if serializer.validated_data.get("property_type") == PropertyTypeEnum.OPTION and not options:
                    return Response(
                        {"options": "A dropdown property needs at least one option"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                prop = serializer.save(
                    workspace_id=project.workspace_id, created_by=request.user, updated_by=request.user
                )
                if prop.property_type == PropertyTypeEnum.OPTION:
                    sync_property_options(prop, options, request.user)

            if self._get_link(project_id, issue_type_id, prop.id):
                return Response(
                    {"error": "This property is already attached to the type in this project"},
                    status=status.HTTP_409_CONFLICT,
                )
            IssueTypeProperty.objects.create(
                project_id=project_id,
                workspace_id=project.workspace_id,
                issue_type_id=issue_type_id,
                property=prop,
                is_required=bool(request.data.get("is_required", prop.is_required))
                and prop.property_type != PropertyTypeEnum.BOOLEAN,
                is_active=bool(request.data.get("is_active", prop.is_active)),
                default_value=request.data.get("default_value", prop.default_value) or [],
                created_by=request.user,
                updated_by=request.user,
            )
        return Response(
            IssuePropertySerializer(self._linked(issue_type_id, project_id, prop.id)).data,
            status=status.HTTP_201_CREATED,
        )

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, issue_type_id, pk):
        """Link settings update; definition fields are forwarded to the library
        definition (workspace admin required if it is used in other projects)."""
        link = self._get_link(project_id, issue_type_id, pk)
        if link is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        prop = link.property

        link_fields = {"is_required", "is_active", "default_value", "sort_order"}
        definition_data = {k: v for k, v in request.data.items() if k not in link_fields and k != "options"}

        if (definition_data or "options" in request.data) and _used_outside_project(prop, project_id):
            if not _is_workspace_admin(request.user, slug):
                return Response(
                    {
                        "error": "This property is used in other projects — only a workspace admin can change "
                        "its definition. You can still change how it behaves in this project."
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        with transaction.atomic():
            for field in link_fields & set(request.data.keys()):
                value = request.data.get(field)
                if field == "is_required":
                    value = bool(value) and prop.property_type != PropertyTypeEnum.BOOLEAN
                if value is not None:
                    setattr(link, field, value)
            link.updated_by = request.user
            link.save()

            if definition_data or "options" in request.data:
                serializer = IssuePropertySerializer(prop, data=definition_data, partial=True)
                if not serializer.is_valid():
                    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
                prop = serializer.save(updated_by=request.user)
                if "options" in request.data and prop.property_type == PropertyTypeEnum.OPTION:
                    sync_property_options(prop, request.data.get("options", []), request.user)

        return Response(
            IssuePropertySerializer(self._linked(issue_type_id, project_id, pk)).data, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, issue_type_id, pk):
        """Detach. `?clear_values=true` also deletes this project's values."""
        link = self._get_link(project_id, issue_type_id, pk)
        if link is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        with transaction.atomic():
            if request.GET.get("clear_values") == "true":
                clear_link_values(link)
            link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def impact(self, request, slug, project_id, issue_type_id, pk):
        """Preflight for the detach prompt: this project's work items carrying a value."""
        if self._get_link(project_id, issue_type_id, pk) is None:
            return Response({"error": "Property not found"}, status=status.HTTP_404_NOT_FOUND)
        issues_with_values = (
            IssuePropertyValue.objects.filter(property_id=pk, project_id=project_id)
            .values("issue_id")
            .distinct()
            .count()
        )
        return Response({"issues_with_values": issues_with_values}, status=status.HTTP_200_OK)


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
