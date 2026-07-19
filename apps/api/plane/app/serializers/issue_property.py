# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers

# Module imports
from .base import BaseSerializer
from plane.db.models import (
    IssueProperty,
    IssuePropertyOption,
    IssuePropertyValue,
    PropertyTypeEnum,
)


class IssuePropertyOptionSerializer(BaseSerializer):
    class Meta:
        model = IssuePropertyOption
        fields = [
            "id",
            "name",
            "description",
            "logo_props",
            "is_active",
            "is_default",
            "sort_order",
            "property",
        ]
        read_only_fields = ["workspace", "project", "property"]


class IssuePropertySerializer(BaseSerializer):
    options = IssuePropertyOptionSerializer(many=True, read_only=True)

    class Meta:
        model = IssueProperty
        fields = [
            "id",
            "display_name",
            "description",
            "logo_props",
            "property_type",
            "relation_type",
            "is_required",
            "is_active",
            "is_multi",
            "default_value",
            "settings",
            "sort_order",
            "issue_type",
            "options",
        ]
        read_only_fields = ["workspace", "project", "issue_type"]

    def validate(self, attrs):
        # property_type is immutable after creation
        if self.instance and "property_type" in attrs and attrs["property_type"] != self.instance.property_type:
            raise serializers.ValidationError({"property_type": "Property type cannot be changed after creation"})

        property_type = attrs.get("property_type", getattr(self.instance, "property_type", None))
        is_required = attrs.get("is_required", getattr(self.instance, "is_required", False))
        relation_type = attrs.get("relation_type", getattr(self.instance, "relation_type", None))

        # BOOLEAN cannot be mandatory (it is a complete two-state answer)
        if property_type == PropertyTypeEnum.BOOLEAN and is_required:
            raise serializers.ValidationError({"is_required": "A boolean property cannot be mandatory"})

        # RELATION requires a relation_type
        if property_type == PropertyTypeEnum.RELATION and not relation_type:
            raise serializers.ValidationError({"relation_type": "A relation property requires a relation type"})

        return attrs


class IssuePropertyValueSerializer(BaseSerializer):
    class Meta:
        model = IssuePropertyValue
        fields = [
            "id",
            "issue",
            "property",
            "value_text",
            "value_boolean",
            "value_decimal",
            "value_datetime",
            "value_uuid",
            "value_option",
        ]
        read_only_fields = ["workspace", "project", "issue"]
