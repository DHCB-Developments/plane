/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  IIssueType,
  IIssueTypeAvailable,
  IIssueProperty,
  TIssueTypePayload,
  TIssuePropertyImpact,
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


  async getAvailableIssueTypes(workspaceSlug: string, projectId: string): Promise<IIssueTypeAvailable[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/available/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async importIssueType(workspaceSlug: string, projectId: string, issueTypeId: string): Promise<IIssueType> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/import/`)
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

  // ----- property library (workspace level) -----
  async getLibraryProperties(workspaceSlug: string, includeArchived = false): Promise<IIssueProperty[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-properties/`, {
      params: includeArchived ? { archived: "true" } : undefined,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createLibraryProperty(workspaceSlug: string, data: TIssuePropertyPayload): Promise<IIssueProperty> {
    return this.post(`/api/workspaces/${workspaceSlug}/issue-properties/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async updateLibraryProperty(
    workspaceSlug: string,
    propertyId: string,
    data: TIssuePropertyPayload
  ): Promise<IIssueProperty> {
    return this.patch(`/api/workspaces/${workspaceSlug}/issue-properties/${propertyId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteLibraryProperty(workspaceSlug: string, propertyId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/issue-properties/${propertyId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getLibraryPropertyImpact(workspaceSlug: string, propertyId: string): Promise<TIssuePropertyImpact> {
    return this.get(`/api/workspaces/${workspaceSlug}/issue-properties/${propertyId}/impact/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async duplicateLibraryProperty(workspaceSlug: string, propertyId: string): Promise<IIssueProperty> {
    return this.post(`/api/workspaces/${workspaceSlug}/issue-properties/${propertyId}/duplicate/`, {})
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  // ----- attachment preflight / detach -----
  async getIssuePropertyDetachImpact(
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    propertyId: string
  ): Promise<{ issues_with_values: number }> {
    return this.get(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/properties/${propertyId}/impact/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async detachIssueProperty(
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    propertyId: string,
    clearValues: boolean
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issue-types/${issueTypeId}/properties/${propertyId}/${clearValues ? "?clear_values=true" : ""}`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
