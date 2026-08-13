/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// services
import {
  GithubIntegrationService,
  type TGithubConnectionStatus,
  type TGithubInstallationRepo,
  type TGithubIssueLinks,
  type TGithubProjectRepository,
} from "@/services/integrations/github-integration.service";
// store
import type { RootStore } from "@/store/root.store";

export interface IGithubIntegrationStore {
  // observables
  connectionStatus: TGithubConnectionStatus | undefined;
  installationRepos: TGithubInstallationRepo[] | undefined;
  projectRepositoriesMap: Record<string, TGithubProjectRepository[]>;
  issueLinksMap: Record<string, TGithubIssueLinks>;
  // computed fns
  isConnected: boolean;
  getProjectRepositories: (projectId: string | null | undefined) => TGithubProjectRepository[] | undefined;
  getProjectDefaultRepository: (projectId: string | null | undefined) => TGithubProjectRepository | undefined;
  getIssueLinks: (issueId: string | null | undefined) => TGithubIssueLinks | undefined;
  // actions
  fetchConnectionStatus: (workspaceSlug: string) => Promise<TGithubConnectionStatus>;
  connect: (workspaceSlug: string, installationId: string) => Promise<void>;
  disconnect: (workspaceSlug: string) => Promise<void>;
  fetchInstallationRepositories: (workspaceSlug: string) => Promise<TGithubInstallationRepo[]>;
  fetchProjectRepositories: (workspaceSlug: string, projectId: string) => Promise<TGithubProjectRepository[]>;
  attachRepository: (
    workspaceSlug: string,
    projectId: string,
    repo: TGithubInstallationRepo
  ) => Promise<TGithubProjectRepository>;
  setDefaultRepository: (workspaceSlug: string, projectId: string, repositoryId: string) => Promise<void>;
  detachRepository: (workspaceSlug: string, projectId: string, repositoryId: string) => Promise<void>;
  fetchIssueLinks: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TGithubIssueLinks>;
}

export class GithubIntegrationStore implements IGithubIntegrationStore {
  connectionStatus: TGithubConnectionStatus | undefined = undefined;
  installationRepos: TGithubInstallationRepo[] | undefined = undefined;
  projectRepositoriesMap: Record<string, TGithubProjectRepository[]> = {};
  issueLinksMap: Record<string, TGithubIssueLinks> = {};

  service: GithubIntegrationService;

  constructor(private rootStore: RootStore) {
    makeObservable(this, {
      connectionStatus: observable,
      installationRepos: observable,
      projectRepositoriesMap: observable,
      issueLinksMap: observable,
      fetchIssueLinks: action,
      fetchConnectionStatus: action,
      connect: action,
      disconnect: action,
      fetchInstallationRepositories: action,
      fetchProjectRepositories: action,
      attachRepository: action,
      setDefaultRepository: action,
      detachRepository: action,
    });
    this.service = new GithubIntegrationService();
  }

  get isConnected() {
    return !!this.connectionStatus?.connection;
  }

  getProjectRepositories = computedFn((projectId: string | null | undefined) =>
    projectId ? this.projectRepositoriesMap[projectId] : undefined
  );

  getProjectDefaultRepository = computedFn((projectId: string | null | undefined) =>
    projectId ? this.projectRepositoriesMap[projectId]?.find((repo) => repo.config?.is_default) : undefined
  );

  getIssueLinks = computedFn((issueId: string | null | undefined) =>
    issueId ? this.issueLinksMap[issueId] : undefined
  );

  fetchIssueLinks = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const links = await this.service.getIssueLinks(workspaceSlug, projectId, issueId);
    runInAction(() => {
      set(this.issueLinksMap, [issueId], links);
    });
    return links;
  };

  fetchConnectionStatus = async (workspaceSlug: string) => {
    const status = await this.service.getConnection(workspaceSlug);
    runInAction(() => {
      this.connectionStatus = status;
    });
    return status;
  };

  connect = async (workspaceSlug: string, installationId: string) => {
    await this.service.connect(workspaceSlug, installationId);
    await this.fetchConnectionStatus(workspaceSlug);
  };

  disconnect = async (workspaceSlug: string) => {
    await this.service.disconnect(workspaceSlug);
    runInAction(() => {
      if (this.connectionStatus) this.connectionStatus = { ...this.connectionStatus, connection: null };
      this.installationRepos = undefined;
    });
  };

  fetchInstallationRepositories = async (workspaceSlug: string) => {
    const repos = await this.service.getInstallationRepositories(workspaceSlug);
    runInAction(() => {
      this.installationRepos = repos;
    });
    return repos;
  };

  fetchProjectRepositories = async (workspaceSlug: string, projectId: string) => {
    const repos = await this.service.getProjectRepositories(workspaceSlug, projectId);
    runInAction(() => {
      set(this.projectRepositoriesMap, [projectId], repos);
    });
    return repos;
  };

  attachRepository = async (workspaceSlug: string, projectId: string, repo: TGithubInstallationRepo) => {
    const attached = await this.service.attachRepository(workspaceSlug, projectId, {
      repository_id: repo.repository_id,
      name: repo.name,
      owner: repo.owner,
      url: repo.url,
      default_branch: repo.default_branch,
    });
    runInAction(() => {
      set(this.projectRepositoriesMap, [projectId], [...(this.projectRepositoriesMap[projectId] ?? []), attached]);
    });
    return attached;
  };

  setDefaultRepository = async (workspaceSlug: string, projectId: string, repositoryId: string) => {
    await this.service.setDefaultRepository(workspaceSlug, projectId, repositoryId);
    // Re-fetch so every repo's is_default flag reflects the server's resolution.
    await this.fetchProjectRepositories(workspaceSlug, projectId);
  };

  detachRepository = async (workspaceSlug: string, projectId: string, repositoryId: string) => {
    await this.service.detachRepository(workspaceSlug, projectId, repositoryId);
    const remaining = (this.projectRepositoriesMap[projectId] ?? []).filter((repo) => repo.id !== repositoryId);
    runInAction(() => {
      if (remaining.length > 0) set(this.projectRepositoriesMap, [projectId], remaining);
      else unset(this.projectRepositoriesMap, [projectId]);
    });
    // The server may have promoted a new default; refresh if repos remain.
    if (remaining.length > 0) await this.fetchProjectRepositories(workspaceSlug, projectId);
  };
}
