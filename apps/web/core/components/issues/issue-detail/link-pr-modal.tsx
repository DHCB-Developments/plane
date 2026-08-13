/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { GitPullRequest, Search } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, CustomSelect, ModalCore, EModalWidth } from "@plane/ui";
// hooks
import { useGithubIntegration } from "@/hooks/store/use-github-integration";
// services
import {
  GithubIntegrationService,
  type TGithubSearchPullRequest,
} from "@/services/integrations/github-integration.service";

const githubService = new GithubIntegrationService();

type TLinkPrModalProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  isOpen: boolean;
  handleClose: () => void;
};

export const LinkPullRequestModal = observer(function LinkPullRequestModal(props: TLinkPrModalProps) {
  const { workspaceSlug, projectId, issueId, isOpen, handleClose } = props;
  // states
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pulls, setPulls] = useState<TGithubSearchPullRequest[] | undefined>(undefined);
  const [linkingNumber, setLinkingNumber] = useState<number | null>(null);
  // store hooks
  const {
    getProjectRepositories,
    getProjectDefaultRepository,
    fetchProjectRepositories,
    getIssueLinks,
    linkPullRequest,
  } = useGithubIntegration();

  const repositories = getProjectRepositories(projectId);
  const linkedNumbersByRepo = new Map(
    (getIssueLinks(issueId)?.pull_requests ?? []).map((pr) => [`${pr.repository_id}:${pr.pr_number}`, true])
  );

  useEffect(() => {
    if (!isOpen) return;
    setSearch("");
    setPulls(undefined);
    void fetchProjectRepositories(workspaceSlug, projectId).then(() => {
      const defaultRepo = getProjectDefaultRepository(projectId);
      setSelectedRepoId((current) => current ?? defaultRepo?.id ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceSlug, projectId]);

  useEffect(() => {
    if (!isOpen || !selectedRepoId) return;
    let cancelled = false;
    setPulls(undefined);
    githubService
      .searchRepositoryPullRequests(workspaceSlug, projectId, selectedRepoId, search || undefined)
      .then((data) => {
        if (!cancelled) setPulls(data);
      })
      .catch(() => {
        if (!cancelled) setPulls([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedRepoId, search, workspaceSlug, projectId]);

  const selectedRepo = repositories?.find((repo) => repo.id === selectedRepoId);

  const handleLink = async (pr: TGithubSearchPullRequest) => {
    if (!selectedRepoId) return;
    setLinkingNumber(pr.number);
    try {
      await linkPullRequest(workspaceSlug, projectId, issueId, { repository: selectedRepoId, pr_number: pr.number });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Pull request linked", message: `#${pr.number} ${pr.title}` });
      handleClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not link pull request",
        message: (error as { error?: string })?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setLinkingNumber(null);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="p-5 pb-3">
        <h4 className="text-16 font-medium text-secondary">Link a pull request</h4>
        <div className="mt-3 flex items-center gap-2">
          <CustomSelect
            value={selectedRepoId}
            onChange={(value: string) => setSelectedRepoId(value)}
            label={selectedRepo ? (selectedRepo.config?.full_name ?? selectedRepo.name) : "Select repository"}
            buttonClassName="h-9"
          >
            {(repositories ?? []).map((repo) => (
              <CustomSelect.Option key={repo.id} value={repo.id}>
                {repo.config?.full_name ?? `${repo.owner}/${repo.name}`}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          <div className="flex h-9 grow items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5">
            <Search className="size-3.5 text-placeholder" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search open pull requests"
              className="h-full w-full bg-transparent text-13 text-secondary outline-none placeholder:text-placeholder"
            />
          </div>
        </div>
        {(repositories ?? []).length === 0 && (
          <p className="mt-2 text-12 text-tertiary">
            This project has no repositories yet — add them in Project Settings → GitHub.
          </p>
        )}
      </div>
      <div className="max-h-[50vh] min-h-32 space-y-2 overflow-y-auto px-5 pb-4">
        {!selectedRepoId ? (
          <p className="py-8 text-center text-13 text-tertiary">Pick a repository to see its open pull requests.</p>
        ) : pulls === undefined ? (
          <p className="py-8 text-center text-13 text-tertiary">Loading pull requests…</p>
        ) : pulls.length === 0 ? (
          <p className="py-8 text-center text-13 text-tertiary">No open pull requests found.</p>
        ) : (
          pulls.map((pr) => {
            const alreadyLinked = selectedRepo
              ? linkedNumbersByRepo.has(`${selectedRepo.repository_id}:${pr.number}`)
              : false;
            return (
              <div key={pr.number} className="flex items-center gap-3 rounded-md border border-subtle p-3">
                <GitPullRequest className="size-4 shrink-0 text-tertiary" />
                <span className="flex grow flex-col overflow-hidden">
                  <span className="truncate text-13 font-medium text-primary">{pr.title}</span>
                  <span className="truncate text-12 text-tertiary">
                    #{pr.number}
                    {pr.author && ` · ${pr.author}`}
                    {pr.source_branch && ` · ${pr.source_branch}`}
                  </span>
                </span>
                <Button
                  variant="neutral-primary"
                  size="sm"
                  disabled={alreadyLinked}
                  loading={linkingNumber === pr.number}
                  onClick={() => void handleLink(pr)}
                >
                  {alreadyLinked ? "Linked" : "Link"}
                </Button>
              </div>
            );
          })
        )}
      </div>
    </ModalCore>
  );
});
