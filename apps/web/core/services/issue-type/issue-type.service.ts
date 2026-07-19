/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  IIssueType,
  IIssueProperty,
  TIssueTypePayload,
  TIssuePropertyPayload,
  TIssuePropertyValues,
} from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class IssueTypeService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getIssueTypes(workspaceSlug: string, projectId: string): Promise<IIssueType[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async enableIssueTypes(workspaceSlug: string, projectId: string): Promise<IIssueType[]> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/enable/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createIssueType(
    workspaceSlug: string,
    projectId: string,
    data: TIssueTypePayload
  ): Promise<IIssueType> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueType(
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: TIssueTypePayload
  ): Promise<IIssueType> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssueType(workspaceSlug: string, projectId: string, issueTypeId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async markDefaultIssueType(workspaceSlug: string, projectId: string, issueTypeId: string): Promise<void> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/mark-default/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ----- custom properties -----
  async getIssueProperties(workspaceSlug: string, projectId: string, issueTypeId: string): Promise<IIssueProperty[]> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/properties/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createIssueProperty(
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: TIssuePropertyPayload
  ): Promise<IIssueProperty> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/properties/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateIssueProperty(
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    propertyId: string,
    data: TIssuePropertyPayload
  ): Promise<IIssueProperty> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/properties/${propertyId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssueProperty(
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    propertyId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/properties/${propertyId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssuePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string
  ): Promise<TIssuePropertyValues> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/issue-property-values/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async setIssuePropertyValues(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssuePropertyValues
  ): Promise<TIssuePropertyValues> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/issue-property-values/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
