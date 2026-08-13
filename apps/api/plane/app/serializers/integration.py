# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from plane.db.models import GithubRepository, Integration, WorkspaceIntegration

from .base import BaseSerializer


class IntegrationSerializer(BaseSerializer):
    class Meta:
        model = Integration
        fields = ["id", "title", "provider", "avatar_url"]
        read_only_fields = fields


class WorkspaceIntegrationSerializer(BaseSerializer):
    integration_detail = IntegrationSerializer(read_only=True, source="integration")

    class Meta:
        model = WorkspaceIntegration
        fields = ["id", "workspace", "integration", "integration_detail", "metadata", "created_at"]
        read_only_fields = fields


class GithubRepositorySerializer(BaseSerializer):
    class Meta:
        model = GithubRepository
        fields = [
            "id",
            "project",
            "workspace",
            "name",
            "owner",
            "url",
            "repository_id",
            "config",
            "created_at",
        ]
        read_only_fields = ["id", "project", "workspace", "created_at"]
