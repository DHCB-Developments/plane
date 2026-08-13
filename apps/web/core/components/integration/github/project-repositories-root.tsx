/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ExternalLink, Github, Lock, Star, Trash2 } from "lucide-react";
import useSWR from "swr";
import { Link } from "react-router";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { AlertModalCore } from "@plane/ui";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useGithubIntegration } from "@/hooks/store/use-github-integration";
// services
import type { TGithubProjectRepository } from "@/services/integrations/github-integration.service";
// local imports
import { AddRepositoryModal } from "./add-repository-modal";

type TProjectGithubRepositoriesRootProps = {
  workspaceSlug: string;
  projectId: string;
};

export const ProjectGithubRepositoriesRoot = observer(function ProjectGithubRepositoriesRoot(
  props: TProjectGithubRepositoriesRootProps
) {
  const { workspaceSlug, projectId } = props;
  // states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [repoToRemove, setRepoToRemove] = useState<TGithubProjectRepository | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  // store hooks
  const {
    connectionStatus,
    isConnected,
    fetchConnectionStatus,
    getProjectRepositories,
    fetchProjectRepositories,
    setDefaultRepository,
    detachRepository,
  } = useGithubIntegration();

  useSWR(
    workspaceSlug ? `GITHUB_CONNECTION_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchConnectionStatus(workspaceSlug) : null
  );
  useSWR(
    workspaceSlug && projectId ? `GITHUB_PROJECT_REPOS_${workspaceSlug}_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchProjectRepositories(workspaceSlug, projectId) : null
  );

  const repositories = getProjectRepositories(projectId);

  const handleSetDefault = async (repo: TGithubProjectRepository) => {
    try {
      await setDefaultRepository(workspaceSlug, projectId, repo.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Default repository updated",
        message: `${repo.config?.full_name ?? repo.name} is now the project's default repository.`,
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not update the default repository." });
    }
  };

  const handleRemove = async () => {
    if (!repoToRemove) return;
    setIsRemoving(true);
    try {
      await detachRepository(workspaceSlug, projectId, repoToRemove.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Repository removed",
        message: `${repoToRemove.config?.full_name ?? repoToRemove.name} was removed from this project.`,
      });
      setRepoToRemove(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not remove the repository." });
    } finally {
      setIsRemoving(false);
    }
  };

  // Connection gate: the workspace must be connected before repos can be added.
  if (connectionStatus && !isConnected) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-subtle-1 py-12 text-center">
        <Github className="size-8 text-tertiary" />
        <div>
          <h4 className="text-14 font-medium">GitHub is not connected</h4>
          <p className="mt-1 max-w-md text-12 text-tertiary">
            Connect GitHub for this workspace first, then come back here to pick the repositories this project works
            with.
          </p>
        </div>
        <Link to={`/${workspaceSlug}/settings/integrations/`}>
          <Button variant="primary" size="base">
            Open workspace integrations
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <AddRepositoryModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        isOpen={isAddModalOpen}
        handleClose={() => setIsAddModalOpen(false)}
      />
      <AlertModalCore
        isOpen={!!repoToRemove}
        handleClose={() => setRepoToRemove(null)}
        handleSubmit={() => void handleRemove()}
        isSubmitting={isRemoving}
        title="Remove repository"
        content={
          <>
            Remove <span className="font-medium">{repoToRemove?.config?.full_name ?? repoToRemove?.name}</span> from
            this project? Existing pull request links on work items are kept, but new activity from this repository
            will no longer default to this project.
          </>
        }
        primaryButtonText={{ loading: "Removing", default: "Remove" }}
      />
      <SettingsHeading
        title="GitHub repositories"
        description="Repositories this project works with. Branches and pull requests from these repos can be linked to this project's work items."
        control={
          <Button variant="primary" size="base" onClick={() => setIsAddModalOpen(true)}>
            Add repositories
          </Button>
        }
      />
      <div className="flex flex-col gap-2 py-4">
        {repositories === undefined ? (
          <p className="py-8 text-center text-13 text-tertiary">Loading…</p>
        ) : repositories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-strong py-10 text-center">
            <p className="text-13 font-medium text-secondary">No repositories yet</p>
            <p className="mt-1 text-12 text-tertiary">
              Add the repositories this project's code lives in to start linking pull requests to work items.
            </p>
          </div>
        ) : (
          repositories.map((repo) => {
            const isDefault = !!repo.config?.is_default;
            return (
              <div
                key={repo.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-subtle-1 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Github className="size-4 shrink-0 text-tertiary" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-13 font-medium">{repo.config?.full_name ?? `${repo.owner}/${repo.name}`}</span>
                      {isDefault && (
                        <span className="shrink-0 rounded border border-accent-strong px-1.5 py-0.5 text-10 font-medium uppercase tracking-wide text-accent-primary">
                          Default
                        </span>
                      )}
                    </div>
                    {repo.config?.default_branch && (
                      <p className="text-11 text-tertiary">default branch: {repo.config.default_branch}</p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!isDefault && (
                    <Tooltip tooltipContent="Make default repository">
                      <button
                        type="button"
                        onClick={() => void handleSetDefault(repo)}
                        className="grid size-7 place-items-center rounded text-tertiary hover:bg-layer-1 hover:text-secondary"
                        aria-label="Make default repository"
                      >
                        <Star className="size-3.5" />
                      </button>
                    </Tooltip>
                  )}
                  {repo.url && (
                    <Tooltip tooltipContent="Open on GitHub">
                      <a
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="grid size-7 place-items-center rounded text-tertiary hover:bg-layer-1 hover:text-secondary"
                        aria-label="Open on GitHub"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    </Tooltip>
                  )}
                  <Tooltip tooltipContent="Remove from project">
                    <button
                      type="button"
                      onClick={() => setRepoToRemove(repo)}
                      className="grid size-7 place-items-center rounded text-tertiary hover:bg-danger-subtle hover:text-danger-secondary"
                      aria-label="Remove repository from project"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
});
