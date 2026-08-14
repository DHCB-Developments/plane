# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports

# Django imports
from django.db import models

# Module imports
from plane.db.models.project import ProjectBaseModel


class GithubRepository(ProjectBaseModel):
    name = models.CharField(max_length=500)
    url = models.URLField(null=True)
    config = models.JSONField(default=dict)
    repository_id = models.BigIntegerField()
    owner = models.CharField(max_length=500)

    def __str__(self):
        """Return the repo name"""
        return f"{self.name}"

    class Meta:
        verbose_name = "Repository"
        verbose_name_plural = "Repositories"
        db_table = "github_repositories"
        ordering = ("-created_at",)


class GithubRepositorySync(ProjectBaseModel):
    repository = models.OneToOneField("db.GithubRepository", on_delete=models.CASCADE, related_name="syncs")
    credentials = models.JSONField(default=dict)
    # Bot user
    actor = models.ForeignKey("db.User", related_name="user_syncs", on_delete=models.CASCADE)
    workspace_integration = models.ForeignKey(
        "db.WorkspaceIntegration", related_name="github_syncs", on_delete=models.CASCADE
    )
    label = models.ForeignKey("db.Label", on_delete=models.SET_NULL, null=True, related_name="repo_syncs")

    def __str__(self):
        """Return the repo sync"""
        return f"{self.repository.name} <{self.project.name}>"

    class Meta:
        unique_together = ["project", "repository"]
        verbose_name = "Github Repository Sync"
        verbose_name_plural = "Github Repository Syncs"
        db_table = "github_repository_syncs"
        ordering = ("-created_at",)


class GithubIssueSync(ProjectBaseModel):
    repo_issue_id = models.BigIntegerField()
    github_issue_id = models.BigIntegerField()
    issue_url = models.URLField(blank=False)
    issue = models.ForeignKey("db.Issue", related_name="github_syncs", on_delete=models.CASCADE)
    repository_sync = models.ForeignKey("db.GithubRepositorySync", related_name="issue_syncs", on_delete=models.CASCADE)

    def __str__(self):
        """Return the github issue sync"""
        return f"{self.repository.name}-{self.project.name}-{self.issue.name}"

    class Meta:
        unique_together = ["repository_sync", "issue"]
        verbose_name = "Github Issue Sync"
        verbose_name_plural = "Github Issue Syncs"
        db_table = "github_issue_syncs"
        ordering = ("-created_at",)


class GithubPullRequestLink(ProjectBaseModel):
    """A pull request linked to a work item. Repo details are denormalized so a
    PR from any repo the workspace connection can see may link to any issue,
    whether or not that repo is in the project's repo set."""

    LINK_TYPE_CHOICES = (
        ("closing", "Closing"),
        ("reference", "Reference"),
        ("relation", "Relation"),
        ("manual", "Manual"),
    )
    STATE_CHOICES = (
        ("draft", "Draft"),
        ("open", "Open"),
        ("merged", "Merged"),
        ("closed", "Closed"),
    )

    issue = models.ForeignKey("db.Issue", related_name="github_pull_requests", on_delete=models.CASCADE)
    repository_id = models.BigIntegerField()
    repo_full_name = models.CharField(max_length=500)
    pr_number = models.IntegerField()
    title = models.CharField(max_length=1000, blank=True)
    url = models.URLField(blank=True)
    state = models.CharField(max_length=20, choices=STATE_CHOICES, default="open")
    review_state = models.CharField(max_length=30, blank=True)
    checks_state = models.CharField(max_length=30, blank=True)
    author = models.CharField(max_length=255, blank=True)
    author_avatar = models.URLField(blank=True)
    source_branch = models.CharField(max_length=500, blank=True)
    target_branch = models.CharField(max_length=500, blank=True)
    link_type = models.CharField(max_length=20, choices=LINK_TYPE_CHOICES, default="reference")
    last_event_at = models.DateTimeField(null=True)
    metadata = models.JSONField(default=dict)

    def __str__(self):
        """Return the linked PR"""
        return f"{self.repo_full_name}#{self.pr_number}"

    class Meta:
        unique_together = ["issue", "repository_id", "pr_number", "deleted_at"]
        verbose_name = "Github Pull Request Link"
        verbose_name_plural = "Github Pull Request Links"
        db_table = "github_pull_request_links"
        ordering = ("-created_at",)


class GithubBranchLink(ProjectBaseModel):
    issue = models.ForeignKey("db.Issue", related_name="github_branches", on_delete=models.CASCADE)
    repository_id = models.BigIntegerField()
    repo_full_name = models.CharField(max_length=500)
    branch_name = models.CharField(max_length=500)
    url = models.URLField(blank=True)

    def __str__(self):
        """Return the linked branch"""
        return f"{self.repo_full_name}:{self.branch_name}"

    class Meta:
        unique_together = ["issue", "repository_id", "branch_name", "deleted_at"]
        verbose_name = "Github Branch Link"
        verbose_name_plural = "Github Branch Links"
        db_table = "github_branch_links"
        ordering = ("-created_at",)


class GithubProjectSettings(ProjectBaseModel):
    """Per-project integration behavior: the PR-event -> work item state
    automation mapping (M5) and the branch name template."""

    automation = models.JSONField(default=dict)
    branch_format = models.CharField(max_length=255, blank=True)

    def __str__(self):
        """Return the project"""
        return f"{self.project_id}"

    class Meta:
        unique_together = ["project", "deleted_at"]
        verbose_name = "Github Project Settings"
        verbose_name_plural = "Github Project Settings"
        db_table = "github_project_settings"
        ordering = ("-created_at",)


class GithubCommentSync(ProjectBaseModel):
    repo_comment_id = models.BigIntegerField()
    comment = models.ForeignKey("db.IssueComment", related_name="comment_syncs", on_delete=models.CASCADE)
    issue_sync = models.ForeignKey("db.GithubIssueSync", related_name="comment_syncs", on_delete=models.CASCADE)

    def __str__(self):
        """Return the github issue sync"""
        return f"{self.comment.id}"

    class Meta:
        unique_together = ["issue_sync", "comment"]
        verbose_name = "Github Comment Sync"
        verbose_name_plural = "Github Comment Syncs"
        db_table = "github_comment_syncs"
        ordering = ("-created_at",)
