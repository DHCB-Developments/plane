/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Lock, Search } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, ModalCore, EModalWidth } from "@plane/ui";
// hooks
import { useGithubIntegration } from "@/hooks/store/use-github-integration";
// services
import type { TGithubInstallationRepo } from "@/services/integrations/github-integration.service";

type TAddRepositoryModalProps = {
  workspaceSlug: string;
  projectId: string;
  isOpen: boolean;
  handleClose: () => void;
};

export const AddRepositoryModal = observer(function AddRepositoryModal(props: TAddRepositoryModalProps) {
  const { workspaceSlug, projectId, isOpen, handleClose } = props;
  // states
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [attachingId, setAttachingId] = useState<number | null>(null);
  // store hooks
  const { installationRepos, fetchInstallationRepositories, getProjectRepositories, attachRepository } =
    useGithubIntegration();

  useEffect(() => {
    if (!isOpen) return;
    setSearch("");
    setIsLoading(true);
    fetchInstallationRepositories(workspaceSlug)
      .catch(() =>
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Could not load repositories",
          message: "Fetching the repository list from GitHub failed. Please try again.",
        })
      )
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceSlug]);

  const attachedRepoIds = useMemo(
    () => new Set((getProjectRepositories(projectId) ?? []).map((repo) => repo.repository_id)),
    [getProjectRepositories, projectId]
  );

  const filtered = useMemo(
    () =>
      (installationRepos ?? []).filter(
        (repo) =>
          !attachedRepoIds.has(repo.repository_id) && repo.full_name.toLowerCase().includes(search.toLowerCase())
      ),
    [installationRepos, attachedRepoIds, search]
  );

  const handleAttach = async (repo: TGithubInstallationRepo) => {
    setAttachingId(repo.repository_id);
    try {
      await attachRepository(workspaceSlug, projectId, repo);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Repository added",
        message: `${repo.full_name} is now available on this project.`,
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not add repository",
        message: (error as { error?: string })?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setAttachingId(null);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="p-5 pb-3">
        <h4 className="text-16 font-medium text-secondary">Add repositories</h4>
        <p className="mt-1 text-12 text-tertiary">
          Repositories come from the workspace&apos;s GitHub connection. Missing one? Grant the GitHub App access to
          it on GitHub, then come back.
        </p>
        <div className="mt-3 flex h-9 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5">
          <Search className="size-3.5 text-placeholder" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search repositories"
            className="h-full w-full bg-transparent text-13 text-secondary outline-none placeholder:text-placeholder"
          />
        </div>
      </div>
      <div className="max-h-[50vh] min-h-32 space-y-2 overflow-y-auto px-5 pb-3">
        {isLoading ? (
          <p className="py-8 text-center text-13 text-tertiary">Loading repositories…</p>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-13 font-medium text-secondary">No repositories to add</p>
            <p className="mt-1 text-12 text-tertiary">
              {search
                ? "Nothing matches your search."
                : "Every repository the GitHub App can access is already on this project."}
            </p>
          </div>
        ) : (
          filtered.map((repo) => (
            <div
              key={repo.repository_id}
              className="flex w-full items-center gap-3 rounded-md border border-subtle p-3"
            >
              <span className="flex grow flex-col overflow-hidden">
                <span className="flex items-center gap-1.5 truncate text-13 font-medium text-primary">
                  {repo.full_name}
                  {repo.private && <Lock className="size-3 shrink-0 text-tertiary" aria-label="Private repository" />}
                </span>
                {repo.default_branch && (
                  <span className="truncate text-12 text-tertiary">default branch: {repo.default_branch}</span>
                )}
              </span>
              <Button
                variant="neutral-primary"
                size="sm"
                loading={attachingId === repo.repository_id}
                onClick={() => void handleAttach(repo)}
              >
                Add
              </Button>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-subtle p-4">
        <Button variant="neutral-primary" size="sm" onClick={handleClose}>
          Done
        </Button>
      </div>
    </ModalCore>
  );
});
