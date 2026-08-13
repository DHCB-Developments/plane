/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
// services
import { APIService } from "@/services/api.service";

// Types live here (not in @plane/types) so editing them never requires a
// packages rebuild while the vite dev server is running.
export type TGithubConnectionStatus = {
  is_app_configured: boolean;
  app_slug: string | null;
  connection: {
    id: string;
    workspace: string;
    metadata: {
      installation_id?: string;
      account_login?: string;
      account_type?: string;
      account_avatar_url?: string;
    };
    created_at: string;
  } | null;
};

export type TGithubInstallationRepo = {
  repository_id: number;
  name: string;
  full_name: string;
  owner: string;
  url: string;
  private: boolean;
  default_branch: string | null;
};

export type TGithubProjectRepository = {
  id: string;
  project: string;
  workspace: string;
  name: string;
  owner: string;
  url: string | null;
  repository_id: number;
  config: {
    full_name?: string;
    default_branch?: string;
    is_default?: boolean;
  };
  created_at: string;
};

export class GithubIntegrationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getConnection(workspaceSlug: string): Promise<TGithubConnectionStatus> {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/github/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async connect(workspaceSlug: string, installationId: string): Promise<TGithubConnectionStatus["connection"]> {
    return this.post(`/api/workspaces/${workspaceSlug}/integrations/github/`, {
      installation_id: installationId,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async disconnect(workspaceSlug: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/integrations/github/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getInstallationRepositories(workspaceSlug: string): Promise<TGithubInstallationRepo[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/github/repositories/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getProjectRepositories(workspaceSlug: string, projectId: string): Promise<TGithubProjectRepository[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/github-repositories/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async attachRepository(
    workspaceSlug: string,
    projectId: string,
    payload: Partial<TGithubInstallationRepo>
  ): Promise<TGithubProjectRepository> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/github-repositories/`, payload)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async setDefaultRepository(
    workspaceSlug: string,
    projectId: string,
    repositoryId: string
  ): Promise<TGithubProjectRepository> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/github-repositories/${repositoryId}/`, {
      is_default: true,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async detachRepository(workspaceSlug: string, projectId: string, repositoryId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/github-repositories/${repositoryId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
