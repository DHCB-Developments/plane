# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import datetime, timezone

# Django imports
from django.conf import settings

# Third party imports
from celery import shared_task

# Module imports
from plane.utils.exception_logger import log_exception


def _resolve_workspace_integration(payload):
    from plane.db.models import WorkspaceIntegration

    installation_id = str(payload.get("installation", {}).get("id", ""))
    if not installation_id:
        return None
    return (
        WorkspaceIntegration.objects.filter(
            integration__provider="github", metadata__installation_id=installation_id
        )
        .select_related("workspace")
        .first()
    )


def _resolve_issues(workspace_id, references):
    """Map parsed {identifier, sequence[, link_type]} references to Issues.

    Unknown identifiers (branch-name noise like "v2-3") resolve to nothing and
    are silently dropped — the ProjectIdentifier table is the source of truth.
    """
    from plane.db.models import Issue, ProjectIdentifier

    resolved = []
    for reference in references:
        project_identifier = ProjectIdentifier.objects.filter(
            workspace_id=workspace_id, name__iexact=reference["identifier"]
        ).first()
        if not project_identifier:
            continue
        issue = Issue.objects.filter(
            project_id=project_identifier.project_id, sequence_id=reference["sequence"]
        ).first()
        if issue:
            resolved.append({"issue": issue, "link_type": reference.get("link_type", "reference")})
    return resolved


def _pr_state(pr):
    if pr.get("merged") or pr.get("merged_at"):
        return "merged"
    if pr.get("state") == "closed":
        return "closed"
    if pr.get("draft"):
        return "draft"
    return "open"


def _pr_fields(pr):
    return {
        "title": (pr.get("title") or "")[:1000],
        "url": pr.get("html_url") or "",
        "state": _pr_state(pr),
        "author": (pr.get("user") or {}).get("login") or "",
        "author_avatar": (pr.get("user") or {}).get("avatar_url") or "",
        "source_branch": (pr.get("head") or {}).get("ref") or "",
        "target_branch": (pr.get("base") or {}).get("ref") or "",
        "last_event_at": datetime.now(timezone.utc),
    }


def _post_linkback(workspace_integration, repository, pr_number, issues):
    """One comment on the PR pointing back to the newly linked work items."""
    from plane.utils.integrations.github import GithubAppClient, GithubApiError, GithubAppNotConfigured

    workspace_slug = workspace_integration.workspace.slug
    base_url = settings.WEB_URL.rstrip("/") if settings.WEB_URL else ""
    lines = []
    for issue in issues:
        item_url = f"{base_url}/{workspace_slug}/projects/{issue.project_id}/issues/{issue.id}"
        lines.append(
            f"- **[{issue.project.identifier}-{issue.sequence_id}]({item_url})** {issue.name}"
        )
    body = "🔗 Linked to Plane work item" + ("s" if len(lines) > 1 else "") + ":\n" + "\n".join(lines)
    try:
        client = GithubAppClient(workspace_integration.metadata.get("installation_id"))
        owner, repo = repository.get("full_name", "/").split("/", 1)
        client.create_issue_comment(owner, repo, pr_number, body)
    except (GithubAppNotConfigured, GithubApiError, ValueError) as e:
        # Linkbacks are best-effort; the link itself is already saved.
        log_exception(e)


def _handle_pull_request_event(workspace_integration, payload):
    from plane.db.models import GithubPullRequestLink
    from plane.utils.integrations.github_refs import parse_branch_references, parse_text_references

    pr = payload.get("pull_request") or {}
    repository = payload.get("repository") or {}
    repository_id = repository.get("id")
    pr_number = pr.get("number")
    if not (repository_id and pr_number):
        return

    workspace_id = workspace_integration.workspace_id
    fields = _pr_fields(pr)

    # Collect references: PR title + body (tiered) and source branch (plain).
    references = parse_text_references(f"{pr.get('title') or ''}\n{pr.get('body') or ''}")
    referenced_keys = {(r["identifier"], r["sequence"]) for r in references}
    for branch_ref in parse_branch_references((pr.get("head") or {}).get("ref") or ""):
        key = (branch_ref["identifier"], branch_ref["sequence"])
        if key not in referenced_keys:
            references.append({**branch_ref, "link_type": "reference"})

    resolved = _resolve_issues(workspace_id, references)

    # Upsert a link per referenced issue; refresh state everywhere.
    newly_linked = []
    for item in resolved:
        issue = item["issue"]
        link, created = GithubPullRequestLink.objects.get_or_create(
            issue=issue,
            repository_id=repository_id,
            pr_number=pr_number,
            defaults={
                "project_id": issue.project_id,
                "workspace_id": workspace_id,
                "repo_full_name": repository.get("full_name") or "",
                "link_type": item["link_type"],
                **fields,
            },
        )
        if created:
            newly_linked.append(issue)
        else:
            # A stronger reference tier upgrades the link; manual stays manual.
            update = dict(fields)
            strength = {"relation": 0, "reference": 1, "closing": 2}
            if link.link_type != "manual" and strength.get(item["link_type"], 0) > strength.get(link.link_type, 0):
                update["link_type"] = item["link_type"]
            for attr, value in update.items():
                setattr(link, attr, value)
            link.save()

    # Update links this event no longer mentions (state changes reach every
    # linked issue: merged/closed/draft transitions, title edits, etc.).
    GithubPullRequestLink.objects.filter(
        workspace_id=workspace_id, repository_id=repository_id, pr_number=pr_number
    ).exclude(issue_id__in=[item["issue"].id for item in resolved]).update(**fields)

    if newly_linked:
        _post_linkback(workspace_integration, repository, pr_number, newly_linked)


def _handle_pull_request_review_event(workspace_integration, payload):
    from plane.db.models import GithubPullRequestLink

    review = payload.get("review") or {}
    pr = payload.get("pull_request") or {}
    repository_id = (payload.get("repository") or {}).get("id")
    state = (review.get("state") or "").lower()
    if state not in ("approved", "changes_requested") or not repository_id:
        return
    GithubPullRequestLink.objects.filter(
        workspace_id=workspace_integration.workspace_id,
        repository_id=repository_id,
        pr_number=pr.get("number"),
    ).update(review_state=state, last_event_at=datetime.now(timezone.utc))


def _handle_check_suite_event(workspace_integration, payload):
    from plane.db.models import GithubPullRequestLink

    check_suite = payload.get("check_suite") or {}
    if payload.get("action") != "completed":
        return
    repository_id = (payload.get("repository") or {}).get("id")
    pr_numbers = [p.get("number") for p in check_suite.get("pull_requests") or [] if p.get("number")]
    if not (repository_id and pr_numbers):
        return
    GithubPullRequestLink.objects.filter(
        workspace_id=workspace_integration.workspace_id,
        repository_id=repository_id,
        pr_number__in=pr_numbers,
    ).update(
        checks_state=check_suite.get("conclusion") or "",
        last_event_at=datetime.now(timezone.utc),
    )


def _handle_branch_event(workspace_integration, payload, deleted=False):
    from plane.db.models import GithubBranchLink
    from plane.utils.integrations.github_refs import parse_branch_references

    if payload.get("ref_type") != "branch":
        return
    branch_name = payload.get("ref") or ""
    repository = payload.get("repository") or {}
    repository_id = repository.get("id")
    if not (branch_name and repository_id):
        return
    workspace_id = workspace_integration.workspace_id

    if deleted:
        for link in GithubBranchLink.objects.filter(
            workspace_id=workspace_id, repository_id=repository_id, branch_name=branch_name
        ):
            link.delete()
        return

    resolved = _resolve_issues(workspace_id, parse_branch_references(branch_name))
    full_name = repository.get("full_name") or ""
    for item in resolved:
        issue = item["issue"]
        GithubBranchLink.objects.get_or_create(
            issue=issue,
            repository_id=repository_id,
            branch_name=branch_name,
            defaults={
                "project_id": issue.project_id,
                "workspace_id": workspace_id,
                "repo_full_name": full_name,
                "url": f"https://github.com/{full_name}/tree/{branch_name}" if full_name else "",
            },
        )


@shared_task
def process_github_event(event, delivery_id, payload):
    """Route a verified GitHub webhook event to its handler."""
    try:
        action = payload.get("action", "")

        if event == "installation" and action == "deleted":
            from plane.db.models import WorkspaceIntegration

            installation_id = str(payload.get("installation", {}).get("id", ""))
            WorkspaceIntegration.objects.filter(
                integration__provider="github",
                metadata__installation_id=installation_id,
            ).delete()
            return

        workspace_integration = _resolve_workspace_integration(payload)
        if not workspace_integration:
            return

        if event == "pull_request":
            _handle_pull_request_event(workspace_integration, payload)
        elif event == "pull_request_review":
            _handle_pull_request_review_event(workspace_integration, payload)
        elif event == "check_suite":
            _handle_check_suite_event(workspace_integration, payload)
        elif event == "create":
            _handle_branch_event(workspace_integration, payload)
        elif event == "delete":
            _handle_branch_event(workspace_integration, payload, deleted=True)
        return
    except Exception as e:
        log_exception(e)
        return
