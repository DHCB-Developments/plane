# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.db import transaction
from django.db.models import Count, OuterRef, Q, Subquery, BooleanField, FloatField
from django.db.models.functions import Coalesce
from django.db.models import Value

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from ..base import BaseViewSet
from plane.app.serializers import IssueTypeSerializer, IssueTypeAvailableSerializer
from plane.app.permissions import ROLE, allow_permission
from plane.db.models import IssueType, ProjectIssueType, Project, Issue, IssueTypeProperty, IssuePropertyValue
from plane.db.models.issue_type import DEFAULT_ISSUE_TYPES


class IssueTypeViewSet(BaseViewSet):
    serializer_class = IssueTypeSerializer
    model = IssueType

    # Batch size for backfilling Issue.type on enable (bounded UPDATE for prod).
    BACKFILL_BATCH_SIZE = 2000

    def get_queryset(self):
        slug = self.kwargs.get("slug")
        project_id = self.kwargs.get("project_id")
        # Per-project mapping rows for this project.
        project_issue_type = ProjectIssueType.objects.filter(
            issue_type_id=OuterRef("pk"), project_id=project_id, deleted_at__isnull=True
        )
        return (
            IssueType.objects.filter(
                workspace__slug=slug,
                project_issue_types__project_id=project_id,
                project_issue_types__deleted_at__isnull=True,
            )
            .annotate(
                project_default=Coalesce(
                    Subquery(project_issue_type.values("is_default")[:1], output_field=BooleanField()),
                    Value(False),
                    output_field=BooleanField(),
                ),
                project_level=Coalesce(
                    Subquery(project_issue_type.values("level")[:1], output_field=FloatField()),
                    Value(0.0),
                    output_field=FloatField(),
                ),
                project_is_active=Coalesce(
                    Subquery(project_issue_type.values("is_active")[:1], output_field=BooleanField()),
                    Value(True),
                    output_field=BooleanField(),
                ),
                # Subquery, NOT Count over the join: the queryset already join-filters
                # on this project's mapping, so a Count would only ever see 1.
                usage_count=Coalesce(
                    Subquery(
                        ProjectIssueType.objects.filter(issue_type_id=OuterRef("pk"), deleted_at__isnull=True)
                        .order_by()
                        .values("issue_type_id")
                        .annotate(c=Count("pk"))
                        .values("c")[:1]
                    ),
                    Value(0),
                ),
            )
            .select_related("workspace")
            .distinct()
        )

    def _get_project(self, slug, project_id):
        return Project.objects.filter(pk=project_id, workspace__slug=slug).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        issue_types = IssueTypeSerializer(self.get_queryset(), many=True).data
        return Response(issue_types, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        issue_type = self.get_queryset().filter(pk=pk).first()
        if issue_type is None:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(IssueTypeSerializer(issue_type).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        project = self._get_project(slug, project_id)
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if not project.is_issue_type_enabled:
            return Response(
                {"error": "Work item types are not enabled for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IssueTypeSerializer(data=request.data, context={"workspace_id": project.workspace_id})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            issue_type = serializer.save(
                workspace_id=project.workspace_id,
                is_epic=False,
                created_by=request.user,
                updated_by=request.user,
            )
            ProjectIssueType.objects.create(
                project_id=project_id,
                issue_type=issue_type,
                is_default=False,
                level=int(issue_type.level or 0),
                created_by=request.user,
                updated_by=request.user,
            )

        instance = self.get_queryset().filter(pk=issue_type.pk).first()
        return Response(IssueTypeSerializer(instance).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        project_issue_type = (
            ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=pk)
            .select_related("issue_type", "issue_type__workspace")
            .first()
        )
        if project_issue_type is None:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        issue_type = project_issue_type.issue_type

        # is_active is per-project state: route it to the mapping, not the shared type.
        is_active = request.data.pop("is_active", None)
        if is_active is not None:
            # The default type cannot be deactivated.
            if is_active is False and project_issue_type.is_default:
                return Response(
                    {"error": "The default work item type cannot be deactivated"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            project_issue_type.is_active = bool(is_active)
            project_issue_type.updated_by = request.user
            project_issue_type.save(update_fields=["is_active", "updated_by", "updated_at"])

        # Anything left (name / description / logo_props) edits the shared workspace type.
        if request.data:
            serializer = IssueTypeSerializer(
                issue_type,
                data=request.data,
                partial=True,
                context={"workspace_id": issue_type.workspace_id},
            )
            if not serializer.is_valid():
                return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            serializer.save(updated_by=request.user)

        instance = self.get_queryset().filter(pk=pk).first()
        return Response(IssueTypeSerializer(instance).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def mark_as_default(self, request, slug, project_id, pk):
        # ProjectIssueType.is_default is authoritative (per-project default).
        target = ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=pk).first()
        if target is None:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            ProjectIssueType.objects.filter(project_id=project_id, is_default=True).exclude(issue_type_id=pk).update(
                is_default=False
            )
            ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=pk).update(is_default=True)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        project_issue_type = ProjectIssueType.objects.filter(project_id=project_id, issue_type_id=pk).first()
        if project_issue_type is None:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)

        if project_issue_type.is_default:
            return Response(
                {"error": "The default work item type cannot be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            # Detach the type from this project. Issues keep their type until
            # changed individually (Issue.type is SET_NULL, so removing the type
            # nulls the FK — it never deletes work items).
            project_issue_type.delete()
            # This project's attachments of properties to the type go with it,
            # along with the values they carried on this project's work items.
            for link in IssueTypeProperty.objects.filter(issue_type_id=pk, project_id=project_id):
                IssuePropertyValue.objects.filter(property_id=link.property_id, project_id=project_id).delete()
                link.delete()
            if not ProjectIssueType.objects.filter(issue_type_id=pk).exists():
                IssueType.objects.filter(pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def available(self, request, slug, project_id):
        """Workspace types not yet linked to this project — the "Import from workspace" picker."""
        project = self._get_project(slug, project_id)
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        # NOTE: exclude() with multiple conditions on a multi-valued relation does
        # NOT apply them to the same row (unlike filter()), so a subquery is used to
        # exclude types with a LIVE mapping to this project; soft-deleted mappings
        # don't count, so removed types can be re-imported.
        linked_type_ids = ProjectIssueType.objects.filter(
            project_id=project_id, deleted_at__isnull=True
        ).values_list("issue_type_id", flat=True)
        issue_types = (
            IssueType.objects.filter(workspace__slug=slug, is_epic=False, deleted_at__isnull=True)
            .exclude(pk__in=linked_type_ids)
            .annotate(
                usage_count=Count(
                    "project_issue_types",
                    filter=Q(project_issue_types__deleted_at__isnull=True),
                    distinct=True,
                ),
                properties_count=Count(
                    "property_links",
                    filter=Q(property_links__deleted_at__isnull=True),
                    distinct=True,
                ),
            )
            .order_by("name")
        )
        return Response(IssueTypeAvailableSerializer(issue_types, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def import_type(self, request, slug, project_id, pk):
        """Link an existing workspace type to this project (idempotent)."""
        project = self._get_project(slug, project_id)
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        if not project.is_issue_type_enabled:
            return Response(
                {"error": "Work item types are not enabled for this project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue_type = IssueType.objects.filter(pk=pk, workspace__slug=slug, deleted_at__isnull=True).first()
        if issue_type is None:
            return Response({"error": "Work item type not found"}, status=status.HTTP_404_NOT_FOUND)
        if issue_type.is_epic:
            return Response({"error": "Epics cannot be imported"}, status=status.HTTP_400_BAD_REQUEST)

        ProjectIssueType.objects.get_or_create(
            project_id=project_id,
            issue_type=issue_type,
            defaults={
                "is_default": False,
                "is_active": True,
                "level": int(issue_type.level or 0),
                "created_by": request.user,
                "updated_by": request.user,
            },
        )
        instance = self.get_queryset().filter(pk=pk).first()
        return Response(IssueTypeSerializer(instance).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def enable(self, request, slug, project_id):
        """Irreversibly enable Work Item Types for a project and seed default types.

        Idempotent: re-calling on an already-enabled project is a no-op that
        returns the current types.
        """
        project = self._get_project(slug, project_id)
        if project is None:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        if project.is_issue_type_enabled:
            return Response(IssueTypeSerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

        with transaction.atomic():
            project.is_issue_type_enabled = True
            project.save(update_fields=["is_issue_type_enabled"])

            default_type = None
            for type_config in DEFAULT_ISSUE_TYPES:
                # Types are a workspace-level catalog: if another project already
                # seeded this type, REUSE it instead of creating a duplicate name.
                issue_type = IssueType.objects.filter(
                    workspace_id=project.workspace_id,
                    name__iexact=type_config["name"],
                    is_epic=type_config["is_epic"],
                    deleted_at__isnull=True,
                ).first()
                if issue_type is None:
                    issue_type = IssueType.objects.create(
                        workspace_id=project.workspace_id,
                        name=type_config["name"],
                        description=type_config["description"],
                        logo_props=type_config["logo_props"],
                        is_epic=type_config["is_epic"],
                        is_default=type_config["is_default"],
                        is_active=True,
                        level=type_config["level"],
                        created_by=request.user,
                        updated_by=request.user,
                    )
                ProjectIssueType.objects.get_or_create(
                    project_id=project_id,
                    issue_type=issue_type,
                    defaults={
                        "is_default": type_config["is_default"],
                        "is_active": True,
                        "level": type_config["level"],
                        "created_by": request.user,
                        "updated_by": request.user,
                    },
                )
                if type_config["is_default"]:
                    default_type = issue_type

            # Backfill existing untyped work items in this project to the default
            # type, in bounded batches (this UPDATE can be large on production).
            if default_type is not None:
                untyped_ids = list(
                    Issue.objects.filter(project_id=project_id, type__isnull=True).values_list("id", flat=True)
                )
                for start in range(0, len(untyped_ids), self.BACKFILL_BATCH_SIZE):
                    batch = untyped_ids[start : start + self.BACKFILL_BATCH_SIZE]
                    Issue.objects.filter(id__in=batch).update(type=default_type)

        return Response(IssueTypeSerializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)
