# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import IssueType


class IssueTypeSerializer(BaseSerializer):
    # Project-level default / level come from the ProjectIssueType mapping and are
    # exposed here as annotations (ProjectIssueType.is_default is authoritative).
    # They are read-only through this serializer; use mark_as_default to change them.
    is_default = serializers.BooleanField(source="project_default", read_only=True, default=False)
    level = serializers.FloatField(source="project_level", read_only=True, default=0)

    class Meta:
        model = IssueType
        fields = [
            "id",
            "name",
            "description",
            "logo_props",
            "is_epic",
            "is_active",
            "is_default",
            "level",
            "workspace_id",
            "external_source",
            "external_id",
        ]
        read_only_fields = ["workspace", "is_epic"]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name cannot be empty")

        # There is no DB-level uniqueness on issue type names (migration 0074 removed
        # it), so enforce it here: unique per workspace among non-deleted types.
        workspace_id = self.context.get("workspace_id")
        if workspace_id is None and self.instance is not None:
            workspace_id = self.instance.workspace_id

        queryset = IssueType.objects.filter(workspace_id=workspace_id, name__iexact=value, deleted_at__isnull=True)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)

        if queryset.exists():
            raise serializers.ValidationError("A work item type with this name already exists")

        return value


class IssueTypeLiteSerializer(BaseSerializer):
    class Meta:
        model = IssueType
        fields = ["id", "name", "logo_props", "is_epic", "is_active"]
        read_only_fields = fields
