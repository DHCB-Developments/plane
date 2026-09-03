# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q, Max
from django.contrib.postgres.fields import ArrayField

# Module imports
from .workspace import WorkspaceBaseModel
from .project import ProjectBaseModel


class PropertyTypeEnum(models.TextChoices):
    """Backend storage types for a custom property."""

    TEXT = "TEXT", "Text"  # docs: Text (single-line / paragraph / read-only)
    DECIMAL = "DECIMAL", "Decimal"  # docs: Number
    OPTION = "OPTION", "Option"  # docs: Dropdown
    BOOLEAN = "BOOLEAN", "Boolean"
    DATETIME = "DATETIME", "Datetime"  # docs: Date
    RELATION = "RELATION", "Relation"  # docs: Member picker
    URL = "URL", "URL"


class RelationTypeEnum(models.TextChoices):
    USER = "USER", "User"  # member picker
    ISSUE = "ISSUE", "Issue"  # headroom for a future work-item / release picker


class IssueProperty(WorkspaceBaseModel):
    """A workspace-level property definition (the "property library").

    Definitions carry name, kind, options and description. They are attached to
    work item types per project through IssueTypeProperty links, which hold the
    per-attachment settings (required, default, order, active). Names are not
    unique: two projects may legitimately want different "Branch" dropdowns.
    `issue_type` is a legacy column kept nullable for compatibility.
    """

    issue_type = models.ForeignKey(
        "db.IssueType", on_delete=models.SET_NULL, related_name="properties", null=True, blank=True
    )
    display_name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    property_type = models.CharField(max_length=255, choices=PropertyTypeEnum.choices)
    relation_type = models.CharField(max_length=255, choices=RelationTypeEnum.choices, null=True, blank=True)
    is_required = models.BooleanField(default=False)  # definition default, copied onto new links
    is_active = models.BooleanField(default=True)
    is_archived = models.BooleanField(default=False)  # hidden from pickers, values stay readable
    is_multi = models.BooleanField(default=False)
    default_value = ArrayField(models.TextField(), blank=True, default=list)
    settings = models.JSONField(default=dict)  # text format, date display format, etc.
    sort_order = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Issue Property"
        verbose_name_plural = "Issue Properties"
        db_table = "issue_properties"
        ordering = ("sort_order",)

    def save(self, *args, **kwargs):
        if self._state.adding:
            largest = IssueProperty.objects.filter(workspace_id=self.workspace_id).aggregate(
                largest=Max("sort_order")
            )["largest"]
            if largest is not None:
                self.sort_order = largest + 10000
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.display_name}"


class IssueTypeProperty(ProjectBaseModel):
    """Attaches a library property to a work item type within one project.

    The link — not the definition — carries requiredness, default, order and
    active state, so one shared definition can behave differently per project.
    """

    issue_type = models.ForeignKey("db.IssueType", on_delete=models.CASCADE, related_name="property_links")
    property = models.ForeignKey("db.IssueProperty", on_delete=models.CASCADE, related_name="type_links")
    is_required = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    default_value = ArrayField(models.TextField(), blank=True, default=list)
    sort_order = models.FloatField(default=65535)

    class Meta:
        verbose_name = "Issue Type Property"
        verbose_name_plural = "Issue Type Properties"
        db_table = "issue_type_properties"
        ordering = ("sort_order",)
        unique_together = ["project", "issue_type", "property", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "issue_type", "property"],
                condition=Q(deleted_at__isnull=True),
                name="issue_type_property_unique_link_when_deleted_at_null",
            )
        ]

    def save(self, *args, **kwargs):
        if self._state.adding:
            largest = IssueTypeProperty.objects.filter(
                project_id=self.project_id, issue_type_id=self.issue_type_id
            ).aggregate(largest=Max("sort_order"))["largest"]
            if largest is not None:
                self.sort_order = largest + 10000
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.issue_type_id} <- {self.property_id} ({self.project_id})"


class IssuePropertyOption(WorkspaceBaseModel):
    property = models.ForeignKey("db.IssueProperty", on_delete=models.CASCADE, related_name="options")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)  # docs: options can have name + icon
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    sort_order = models.FloatField(default=65535)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Issue Property Option"
        verbose_name_plural = "Issue Property Options"
        db_table = "issue_property_options"
        ordering = ("sort_order",)
        unique_together = ["property", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["property", "name"],
                condition=Q(deleted_at__isnull=True),
                name="issue_property_option_unique_property_name_when_deleted_at_null",
            )
        ]

    def save(self, *args, **kwargs):
        if self._state.adding:
            largest = IssuePropertyOption.objects.filter(property=self.property).aggregate(largest=Max("sort_order"))[
                "largest"
            ]
            if largest is not None:
                self.sort_order = largest + 10000
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name}"


class IssuePropertyValue(ProjectBaseModel):
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="property_values")
    property = models.ForeignKey("db.IssueProperty", on_delete=models.CASCADE, related_name="values")
    # Only the column matching property.property_type is populated per row.
    value_text = models.TextField(blank=True, null=True)  # TEXT + URL
    value_boolean = models.BooleanField(default=False)  # BOOLEAN
    value_decimal = models.DecimalField(max_digits=19, decimal_places=4, null=True, blank=True)  # DECIMAL
    value_datetime = models.DateTimeField(null=True, blank=True)  # DATETIME
    value_uuid = models.UUIDField(null=True, blank=True)  # RELATION (user/issue id) — not an FK
    value_option = models.ForeignKey(
        "db.IssuePropertyOption", on_delete=models.CASCADE, related_name="values", null=True, blank=True
    )  # OPTION
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        verbose_name = "Issue Property Value"
        verbose_name_plural = "Issue Property Values"
        db_table = "issue_property_values"
        ordering = ("-created_at",)
        # NO unique_together on (issue, property): is_multi stores one row per value.
        indexes = [models.Index(fields=["issue", "property"], name="ipv_issue_prop_idx")]

    def __str__(self):
        return f"{self.issue_id} - {self.property_id}"
