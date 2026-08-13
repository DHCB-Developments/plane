/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Check, CircleDot, Copy, GitBranch, GitMerge, GitPullRequest, GitPullRequestDraft, X } from "lucide-react";
import useSWR from "swr";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { cn, copyTextToClipboard } from "@plane/utils";
// hooks
import { useGithubIntegration } from "@/hooks/store/use-github-integration";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
// services
import type { TGithubPullRequestLink } from "@/services/integrations/github-integration.service";

type TGithubLinksSectionProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
};

const PR_STATE_META: Record<TGithubPullRequestLink["state"], { label: string; icon: typeof GitPullRequest; className: string }> = {
  draft: { label: "Draft", icon: GitPullRequestDraft, className: "bg-layer-1 text-tertiary" },
  open: { label: "Open", icon: GitPullRequest, className: "bg-success-subtle text-success-primary" },
  merged: { label: "Merged", icon: GitMerge, className: "bg-accent-subtle text-accent-primary" },
  closed: { label: "Closed", icon: X, className: "bg-danger-subtle text-danger-secondary" },
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

export const GithubLinksSection = observer(function GithubLinksSection(props: TGithubLinksSectionProps) {
  const { workspaceSlug, projectId, issueId } = props;
  // store hooks
  const { connectionStatus, isConnected, fetchConnectionStatus, getIssueLinks, fetchIssueLinks } =
    useGithubIntegration();
  const { getProjectById } = useProject();
  const { data: currentUser } = useUser();
  const {
    issue: { getIssueById },
  } = useIssueDetail();

  useSWR(
    workspaceSlug ? `GITHUB_CONNECTION_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchConnectionStatus(workspaceSlug) : null
  );
  useSWR(
    isConnected && workspaceSlug && projectId && issueId
      ? `GITHUB_ISSUE_LINKS_${workspaceSlug}_${issueId}`
      : null,
    isConnected ? () => fetchIssueLinks(workspaceSlug, projectId, issueId) : null,
    { refreshInterval: 30000, revalidateOnFocus: true }
  );

  const links = getIssueLinks(issueId);
  const issue = getIssueById(issueId);
  const project = getProjectById(projectId);

  // Render nothing until the workspace is connected (or if it has no links and
  // was disconnected later — the section header still offers copy-branch-name
  // only for connected workspaces).
  if (!connectionStatus || !isConnected) return null;

  const handleCopyBranchName = () => {
    if (!issue || !project) return;
    const username = slugify(currentUser?.display_name ?? "") || "feature";
    const branchName = `${username}/${project.identifier.toLowerCase()}-${issue.sequence_id}-${slugify(issue.name)}`;
    void copyTextToClipboard(branchName).then(() =>
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: branchName })
    );
  };

  const pullRequests = links?.pull_requests ?? [];
  const branches = (links?.branches ?? []).filter(
    // Hide branches whose PR is already shown — the PR row carries more signal.
    (branch) => !pullRequests.some((pr) => pr.source_branch === branch.branch_name)
  );

  return (
    <div className="border-t border-subtle-1 py-4">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-13 font-medium text-secondary">GitHub</h5>
        <Tooltip tooltipContent="Copy branch name">
          <button
            type="button"
            onClick={handleCopyBranchName}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-11 font-medium text-tertiary hover:bg-layer-1 hover:text-secondary"
          >
            <Copy className="size-3" />
            Copy branch name
          </button>
        </Tooltip>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">
        {pullRequests.length === 0 && branches.length === 0 && (
          <p className="text-12 text-tertiary">
            No pull requests linked yet. Name a branch or mention{" "}
            <span className="font-medium">
              {project?.identifier}-{issue?.sequence_id}
            </span>{" "}
            in a PR to link it.
          </p>
        )}
        {pullRequests.map((pr) => {
          const meta = PR_STATE_META[pr.state] ?? PR_STATE_META.open;
          const StateIcon = meta.icon;
          return (
            <a
              key={pr.id}
              href={pr.url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-md border border-subtle-1 px-2.5 py-2 hover:bg-layer-1"
            >
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-11 font-medium",
                  meta.className
                )}
              >
                <StateIcon className="size-3" />
                {meta.label}
              </span>
              <span className="min-w-0 grow">
                <span className="block truncate text-12 font-medium text-primary group-hover:underline">
                  {pr.title || `#${pr.pr_number}`}
                </span>
                <span className="block truncate text-11 text-tertiary">
                  {pr.repo_full_name}#{pr.pr_number}
                  {pr.source_branch && ` · ${pr.source_branch}`}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {pr.review_state === "approved" && (
                  <Tooltip tooltipContent="Review approved">
                    <Check className="size-3.5 text-success-primary" />
                  </Tooltip>
                )}
                {pr.review_state === "changes_requested" && (
                  <Tooltip tooltipContent="Changes requested">
                    <CircleDot className="size-3.5 text-danger-secondary" />
                  </Tooltip>
                )}
                {pr.checks_state === "success" && (
                  <Tooltip tooltipContent="Checks passing">
                    <span className="text-11 font-medium text-success-primary">✓</span>
                  </Tooltip>
                )}
                {pr.checks_state === "failure" && (
                  <Tooltip tooltipContent="Checks failing">
                    <span className="text-11 font-medium text-danger-secondary">✕</span>
                  </Tooltip>
                )}
              </span>
            </a>
          );
        })}
        {branches.map((branch) => (
          <a
            key={branch.id}
            href={branch.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 rounded-md border border-subtle-1 px-2.5 py-2 hover:bg-layer-1"
          >
            <GitBranch className="size-3.5 shrink-0 text-tertiary" />
            <span className="min-w-0 grow">
              <span className="block truncate text-12 font-medium text-primary group-hover:underline">
                {branch.branch_name}
              </span>
              <span className="block truncate text-11 text-tertiary">{branch.repo_full_name}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
});
