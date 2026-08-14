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
    from django.db.models import Q

    from plane.db.models import WorkspaceIntegration

    installation_id = str(payload.get("installation", {}).get("id", ""))
    if not installation_id:
        return None
    return (
        WorkspaceIntegration.objects.filter(
            Q(metadata__installation_id=installation_id)
            | Q(metadata__installations__contains=[{"installation_id": installation_id}]),
            integration__provider="github",
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
    from plane.utils.integrations.github import GithubApiError, GithubAppNotConfigured, client_for_owner

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
        owner, repo = repository.get("full_name", "/").split("/", 1)
        client = client_for_owner(workspace_integration, owner)
        client.create_issue_comment(owner, repo, pr_number, body)
    except (GithubAppNotConfigured, GithubApiError, ValueError) as e:
        # Linkbacks are best-effort; the link itself is already saved.
        log_exception(e)


def _automation_event_for_state(pr_state):
    return {
        "draft": "draft_pr",
        "open": "open_pr",
        "merged": "pr_merged",
        "closed": "pr_closed",
    }.get(pr_state)



def _branch_matches(pattern, branch):
    import fnmatch

    if not (pattern and branch):
        return False
    return fnmatch.fnmatch(branch.lower(), pattern.lower())


def _resolve_merge_rule(automation, target_branch):
    """State for a merged PR: first matching branch rule, else the plain mapping."""
    for rule in automation.get("pr_merged_rules") or []:
        if _branch_matches(rule.get("pattern"), target_branch):
            return rule.get("state")
    return automation.get("pr_merged")


def _apply_state_automation(workspace_integration, repository_id, pr_number, event_key=None):
    """Move linked work items per their project's automation mapping.

    Rules: relation links never automate; only closing links complete on merge,
    and only once every other closing PR on the item is merged/closed
    (the multi-PR guard).
    """
    import time as time_module

    from plane.db.models import GithubProjectSettings, GithubPullRequestLink, Issue, IssueActivity, State

    links = GithubPullRequestLink.objects.filter(
        workspace_id=workspace_integration.workspace_id,
        repository_id=repository_id,
        pr_number=pr_number,
    ).exclude(link_type="relation")

    for link in links:
        settings_row = GithubProjectSettings.objects.filter(project_id=link.project_id).first()
        automation = (settings_row.automation if settings_row else None) or {}
        key = event_key or _automation_event_for_state(link.state)
        if not key:
            continue
        if key == "pr_merged":
            if link.link_type != "closing":
                continue
            blocking = (
                GithubPullRequestLink.objects.filter(issue_id=link.issue_id, link_type="closing")
                .exclude(pk=link.pk)
                .exclude(state__in=["merged", "closed"])
                .exists()
            )
            if blocking:
                continue
        if key == "pr_merged":
            # Branch-aware rules: the first pattern matching the merge target
            # wins; the plain pr_merged mapping is the fallback.
            target_state_id = _resolve_merge_rule(automation, link.target_branch)
        else:
            target_state_id = automation.get(key)
        if not target_state_id:
            continue
        target_state = State.objects.filter(pk=target_state_id, project_id=link.project_id).first()
        if not target_state:
            continue
        issue = Issue.objects.filter(pk=link.issue_id).first()
        if not issue or str(issue.state_id) == str(target_state.id):
            continue
        old_state = State.objects.filter(pk=issue.state_id).first()
        # Never pull a finished item back into progress: once a work item sits
        # in a completed/cancelled state, only pr_merged (which targets a
        # completed state anyway) may move it.
        if old_state and old_state.group in ("completed", "cancelled") and key != "pr_merged":
            continue
        issue.state_id = target_state.id
        issue.save(update_fields=["state_id", "updated_at"])
        IssueActivity.objects.create(
            issue_id=issue.id,
            actor_id=workspace_integration.actor_id,
            verb="updated",
            old_value=old_state.name if old_state else None,
            new_value=target_state.name,
            field="state",
            project_id=link.project_id,
            workspace_id=workspace_integration.workspace_id,
            comment=f"updated the state to (GitHub: {link.repo_full_name}#{link.pr_number})",
            old_identifier=old_state.id if old_state else None,
            new_identifier=target_state.id,
            epoch=int(time_module.time()),
        )



def _upsert_pr_links(workspace_integration, repository, pr_number, fields, resolved):
    """Create/refresh a link row per resolved issue; returns newly linked issues."""
    from plane.db.models import GithubPullRequestLink

    workspace_id = workspace_integration.workspace_id
    newly_linked = []
    for item in resolved:
        issue = item["issue"]
        link, created = GithubPullRequestLink.objects.get_or_create(
            issue=issue,
            repository_id=repository.get("id"),
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
    return newly_linked


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
    newly_linked = _upsert_pr_links(workspace_integration, repository, pr_number, fields, resolved)

    # Update links this event no longer mentions (state changes reach every
    # linked issue: merged/closed/draft transitions, title edits, etc.).
    GithubPullRequestLink.objects.filter(
        workspace_id=workspace_id, repository_id=repository_id, pr_number=pr_number
    ).exclude(issue_id__in=[item["issue"].id for item in resolved]).update(**fields)

    if newly_linked:
        _post_linkback(workspace_integration, repository, pr_number, newly_linked)

    _apply_state_automation(workspace_integration, repository_id, pr_number)
    _apply_release_cascade(workspace_integration, payload)




def _apply_release_cascade(workspace_integration, payload):
    """A release branch shipped: complete every work item staged through it.

    Fires when a merged PR's SOURCE branch matches a project's cascade pattern
    and its target matches the configured ship branch. Items qualify when all
    their closing PRs are merged/closed and at least one merged into the
    release branch in this repository.
    """
    import time as time_module

    from plane.db.models import GithubProjectSettings, GithubPullRequestLink, Issue, IssueActivity, State

    pr = payload.get("pull_request") or {}
    if not (pr.get("merged") or pr.get("merged_at")):
        return
    source_branch = (pr.get("head") or {}).get("ref") or ""
    target_branch = (pr.get("base") or {}).get("ref") or ""
    repository_id = (payload.get("repository") or {}).get("id")
    if not (source_branch and repository_id):
        return

    for settings_row in GithubProjectSettings.objects.filter(
        workspace_id=workspace_integration.workspace_id
    ):
        cascade = (settings_row.automation or {}).get("release_cascade") or {}
        if not cascade.get("enabled"):
            continue
        if not _branch_matches(cascade.get("source_pattern"), source_branch):
            continue
        ship_branch = cascade.get("target_branch")
        if ship_branch and ship_branch.lower() != target_branch.lower():
            continue

        target_state = None
        if cascade.get("state"):
            target_state = State.objects.filter(
                pk=cascade["state"], project_id=settings_row.project_id
            ).first()
        if not target_state:
            target_state = State.objects.filter(
                project_id=settings_row.project_id, group="completed", default=True
            ).first() or State.objects.filter(
                project_id=settings_row.project_id, group="completed"
            ).first()
        if not target_state:
            continue

        staged_issue_ids = (
            GithubPullRequestLink.objects.filter(
                project_id=settings_row.project_id,
                repository_id=repository_id,
                target_branch=source_branch,
                link_type="closing",
                state__in=["merged", "closed"],
            )
            .values_list("issue_id", flat=True)
            .distinct()
        )
        for issue_id in staged_issue_ids:
            open_work = (
                GithubPullRequestLink.objects.filter(issue_id=issue_id, link_type="closing")
                .exclude(state__in=["merged", "closed"])
                .exists()
            )
            if open_work:
                continue
            issue = Issue.objects.filter(pk=issue_id).first()
            if not issue or str(issue.state_id) == str(target_state.id):
                continue
            old_state = State.objects.filter(pk=issue.state_id).first()
            issue.state_id = target_state.id
            issue.save(update_fields=["state_id", "updated_at"])
            IssueActivity.objects.create(
                issue_id=issue.id,
                actor_id=workspace_integration.actor_id,
                verb="updated",
                old_value=old_state.name if old_state else None,
                new_value=target_state.name,
                field="state",
                project_id=settings_row.project_id,
                workspace_id=workspace_integration.workspace_id,
                comment=f"updated the state to (release {source_branch} shipped)",
                old_identifier=old_state.id if old_state else None,
                new_identifier=target_state.id,
                epoch=int(time_module.time()),
            )


def _handle_issue_comment_event(workspace_integration, payload):
    """Link work items mentioned in PR comments (e.g. "#ORBIT-1" or "fixes ORBIT-1").

    Bot comments are ignored so linkbacks (ours or other integrations') can
    never feed back into new links.
    """
    from plane.utils.integrations.github import GithubApiError, GithubAppNotConfigured, client_for_owner
    from plane.utils.integrations.github_refs import parse_text_references

    if payload.get("action") not in ("created", "edited"):
        return
    if (payload.get("sender") or {}).get("type") == "Bot":
        return
    issue_obj = payload.get("issue") or {}
    if not issue_obj.get("pull_request"):
        # A comment on a plain GitHub issue, not a PR.
        return

    references = parse_text_references((payload.get("comment") or {}).get("body") or "")
    resolved = _resolve_issues(workspace_integration.workspace_id, references)
    if not resolved:
        return

    repository = payload.get("repository") or {}
    pr_number = issue_obj.get("number")
    owner = (repository.get("full_name") or "/").split("/", 1)[0]
    try:
        pr = client_for_owner(workspace_integration, owner).get_pull_request(
            owner, repository.get("name"), pr_number
        )
    except (GithubAppNotConfigured, GithubApiError) as e:
        log_exception(e)
        return

    newly_linked = _upsert_pr_links(
        workspace_integration, repository, pr_number, _pr_fields(pr), resolved
    )
    if newly_linked:
        _post_linkback(workspace_integration, repository, pr_number, newly_linked)
    _apply_state_automation(workspace_integration, repository.get("id"), pr_number)


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

    if state == "approved":
        _apply_state_automation(workspace_integration, repository_id, pr.get("number"), event_key="pr_approved")


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
            from plane.utils.integrations.github import get_installations

            installation_id = str(payload.get("installation", {}).get("id", ""))
            workspace_integration = _resolve_workspace_integration(payload)
            if workspace_integration:
                remaining = [
                    i
                    for i in get_installations(workspace_integration)
                    if str(i.get("installation_id")) != installation_id
                ]
                workspace_integration.metadata = {"installations": remaining}
                workspace_integration.save(update_fields=["metadata"])
            return

        workspace_integration = _resolve_workspace_integration(payload)
        if not workspace_integration:
            return

        if event == "pull_request":
            _handle_pull_request_event(workspace_integration, payload)
        elif event == "pull_request_review":
            _handle_pull_request_review_event(workspace_integration, payload)
        elif event == "issue_comment":
            _handle_issue_comment_event(workspace_integration, payload)
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
