# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Module imports
from plane.db.models import (
    GithubBranchLink,
    GithubPullRequestLink,
    GithubRepository,
    Integration,
    WorkspaceIntegration,
)

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


class GithubPullRequestLinkSerializer(BaseSerializer):
    class Meta:
        model = GithubPullRequestLink
        fields = [
            "id",
            "issue",
            "repository_id",
            "repo_full_name",
            "pr_number",
            "title",
            "url",
            "state",
            "review_state",
            "checks_state",
            "author",
            "author_avatar",
            "source_branch",
            "target_branch",
            "link_type",
            "last_event_at",
            "created_at",
        ]
        read_only_fields = fields


class GithubBranchLinkSerializer(BaseSerializer):
    class Meta:
        model = GithubBranchLink
        fields = ["id", "issue", "repository_id", "repo_full_name", "branch_name", "url", "created_at"]
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
