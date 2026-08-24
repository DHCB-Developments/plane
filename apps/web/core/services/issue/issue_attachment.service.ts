/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { AxiosRequestConfig } from "axios";
import { API_BASE_URL } from "@plane/constants";
// plane types
import { getFileMetaDataForUpload, generateFileUploadPayload } from "@plane/services";
import type { TIssueAttachment, TIssueAttachmentUploadResponse, TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// services
import { APIService } from "@/services/api.service";
import { FileUploadService } from "@/services/file-upload.service";

export class IssueAttachmentService extends APIService {
  private fileUploadService: FileUploadService;
  private serviceType: TIssueServiceType;

  constructor(serviceType: TIssueServiceType = EIssueServiceType.ISSUES) {
    super(API_BASE_URL);
    // upload service
    this.fileUploadService = new FileUploadService();
    this.serviceType = serviceType;
  }

  private async updateIssueAttachmentUploadStatus(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    attachmentId: string
  ): Promise<void> {
    return this.patch(
      `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/attachments/${attachmentId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async uploadIssueAttachment(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    file: File,
    uploadProgressHandler?: AxiosRequestConfig["onUploadProgress"]
  ): Promise<TIssueAttachment> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    return this.post(
      `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/attachments/`,
      fileMetaData
    )
      .then(async (response) => {
        const signedURLResponse: TIssueAttachmentUploadResponse = response?.data;
        const fileUploadPayload = generateFileUploadPayload(signedURLResponse, file);
        await this.fileUploadService.uploadFile(
          signedURLResponse.upload_data.url,
          fileUploadPayload,
          uploadProgressHandler
        );
        await this.updateIssueAttachmentUploadStatus(workspaceSlug, projectId, issueId, signedURLResponse.asset_id);
        return signedURLResponse.attachment;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getIssueAttachments(workspaceSlug: string, projectId: string, issueId: string): Promise<TIssueAttachment[]> {
    return this.get(
      `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/attachments/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteIssueAttachment(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    assetId: string
  ): Promise<TIssueAttachment> {
    return this.delete(
      `/api/assets/v2/workspaces/${workspaceSlug}/projects/${projectId}/${this.serviceType}/${issueId}/attachments/${assetId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export class CommentAttachmentService extends APIService {
  private fileUploadService: FileUploadService;

  constructor() {
    super(API_BASE_URL);
    this.fileUploadService = new FileUploadService();
  }

  private baseUrl(workspaceSlug: string, projectId: string, issueId: string, commentId: string) {
    return `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/${commentId}/attachments/`;
  }

  async uploadCommentAttachment(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    commentId: string,
    file: File,
    uploadProgressHandler?: AxiosRequestConfig["onUploadProgress"]
  ): Promise<TIssueAttachment> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    return this.post(this.baseUrl(workspaceSlug, projectId, issueId, commentId), fileMetaData)
      .then(async (response) => {
        const signedURLResponse: TIssueAttachmentUploadResponse = response?.data;
        const fileUploadPayload = generateFileUploadPayload(signedURLResponse, file);
        await this.fileUploadService.uploadFile(
          signedURLResponse.upload_data.url,
          fileUploadPayload,
          uploadProgressHandler
        );
        await this.patch(
          `${this.baseUrl(workspaceSlug, projectId, issueId, commentId)}${signedURLResponse.asset_id}/`
        );
        return signedURLResponse.attachment;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async getCommentAttachments(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    commentId: string
  ): Promise<TIssueAttachment[]> {
    return this.get(this.baseUrl(workspaceSlug, projectId, issueId, commentId))
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteCommentAttachment(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    commentId: string,
    assetId: string
  ): Promise<void> {
    return this.delete(`${this.baseUrl(workspaceSlug, projectId, issueId, commentId)}${assetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}

export class PendingCommentAttachmentService extends APIService {
  private fileUploadService: FileUploadService;

  constructor() {
    super(API_BASE_URL);
    this.fileUploadService = new FileUploadService();
  }

  async uploadPending(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    file: File
  ): Promise<TIssueAttachment> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    const base = `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comment-attachments/`;
    return this.post(base, fileMetaData)
      .then(async (response) => {
        const signedURLResponse: TIssueAttachmentUploadResponse = response?.data;
        const fileUploadPayload = generateFileUploadPayload(signedURLResponse, file);
        await this.fileUploadService.uploadFile(signedURLResponse.upload_data.url, fileUploadPayload);
        await this.patch(`${base}${signedURLResponse.asset_id}/`);
        return signedURLResponse.attachment;
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deletePending(workspaceSlug: string, projectId: string, issueId: string, assetId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comment-attachments/${assetId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async bind(
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    commentId: string,
    assetIds: string[]
  ): Promise<void> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/${commentId}/attachments/bind/`,
      { asset_ids: assetIds }
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
