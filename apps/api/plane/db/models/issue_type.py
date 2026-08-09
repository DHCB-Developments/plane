# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel
from .base import BaseModel


class IssueType(BaseModel):
    workspace = models.ForeignKey("db.Workspace", related_name="issue_types", on_delete=models.CASCADE)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    logo_props = models.JSONField(default=dict)
    is_epic = models.BooleanField(default=False)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    level = models.FloatField(default=0)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        verbose_name = "Issue Type"
        verbose_name_plural = "Issue Types"
        db_table = "issue_types"

    def __str__(self):
        return self.name


class ProjectIssueType(ProjectBaseModel):
    issue_type = models.ForeignKey("db.IssueType", related_name="project_issue_types", on_delete=models.CASCADE)
    level = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)
    # Per-project activation: a shared (workspace) type can be active in one
    # project and disabled in another. IssueType.is_active stays as a
    # workspace-level retire flag and is no longer used for project gating.
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ["project", "issue_type", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["project", "issue_type"],
                condition=Q(deleted_at__isnull=True),
                name="project_issue_type_unique_project_issue_type_when_deleted_at_null",
            )
        ]
        verbose_name = "Project Issue Type"
        verbose_name_plural = "Project Issue Types"
        db_table = "project_issue_types"
        ordering = ("project", "issue_type")

    def __str__(self):
        return f"{self.project} - {self.issue_type}"


# Types seeded into a project when Work Item Types are enabled.
# v1: only the default "Work Item" type. Epic is intentionally NOT seeded to
# avoid changing the global IssueManager (epics would otherwise leak into every
# list/board/cycle/analytics query, since IssueManager has no epic exclusion).
DEFAULT_ISSUE_TYPES = [
    {
        "name": "Work Item",
        "description": "A default work item type.",
        "logo_props": {"in_use": "icon", "icon": {"name": "Layers", "color": "#6c7ae0", "background_color": "#6c7ae0"}},
        "is_epic": False,
        "is_default": True,
        "level": 0,
    }
]
