# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import GithubRepositorySerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import GithubRepository

from .github import get_github_workspace_integration


class ProjectGithubRepositoryViewSet(BaseViewSet):
    """The project's repo set: which of the workspace's connected repositories
    this project works with. `config.is_default` marks the default repo used by
    quick actions (copy branch name, PR picker preselection)."""

    serializer_class = GithubRepositorySerializer
    model = GithubRepository

    def get_queryset(self):
        return GithubRepository.objects.filter(
            workspace__slug=self.kwargs.get("slug"),
            project_id=self.kwargs.get("project_id"),
        ).order_by("created_at")

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        serializer = GithubRepositorySerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        if not get_github_workspace_integration(slug):
            return Response(
                {"error": "GitHub is not connected to this workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        repository_id = request.data.get("repository_id")
        name = request.data.get("name")
        owner = request.data.get("owner")
        if not (repository_id and name and owner):
            return Response(
                {"error": "repository_id, name and owner are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if self.get_queryset().filter(repository_id=repository_id).exists():
            return Response(
                {"error": "This repository is already added to the project"},
                status=status.HTTP_409_CONFLICT,
            )

        config = {"full_name": f"{owner}/{name}"}
        if request.data.get("default_branch"):
            config["default_branch"] = request.data.get("default_branch")
        # First repo attached becomes the default automatically.
        if not self.get_queryset().exists():
            config["is_default"] = True

        repository = GithubRepository.objects.create(
            project_id=project_id,
            repository_id=repository_id,
            name=name,
            owner=owner,
            url=request.data.get("url"),
            config=config,
        )
        return Response(
            GithubRepositorySerializer(repository).data, status=status.HTTP_201_CREATED
        )

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        """Currently routes one mutation: making this repo the project default."""
        repository = self.get_queryset().get(pk=pk)
        if request.data.get("is_default") is True:
            for other in self.get_queryset().exclude(pk=pk):
                if other.config.get("is_default"):
                    other.config["is_default"] = False
                    other.save(update_fields=["config"])
            repository.config["is_default"] = True
            repository.save(update_fields=["config"])
        return Response(
            GithubRepositorySerializer(repository).data, status=status.HTTP_200_OK
        )

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        repository = self.get_queryset().get(pk=pk)
        was_default = bool(repository.config.get("is_default"))
        repository.delete()
        # Keep exactly one default while repos remain.
        if was_default:
            successor = self.get_queryset().first()
            if successor:
                successor.config["is_default"] = True
                successor.save(update_fields=["config"])
        return Response(status=status.HTTP_204_NO_CONTENT)
