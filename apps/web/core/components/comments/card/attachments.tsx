/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef, useState } from "react";
import { observer } from "mobx-react";
import { Loader2, Paperclip, X } from "lucide-react";
import useSWR, { mutate } from "swr";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { convertBytesToSize } from "@plane/utils";
// components
import { IssueAttachmentPreviewModal } from "@/components/issues/attachment/attachment-preview-modal";
import { AttachmentThumbnail } from "@/components/issues/attachment/attachment-thumbnail";
// hooks
import { useFileSize } from "@/hooks/use-file-size";
// services
import { CommentAttachmentService } from "@/services/issue/issue_attachment.service";

const commentAttachmentService = new CommentAttachmentService();

type TCommentAttachmentsProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  commentId: string;
  disabled?: boolean;
};

export const CommentAttachments = observer(function CommentAttachments(props: TCommentAttachmentsProps) {
  const { workspaceSlug, projectId, issueId, commentId, disabled = false } = props;
  // states
  const [isUploading, setIsUploading] = useState(false);
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  // refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  // hooks
  const { maxFileSize } = useFileSize();

  const swrKey = `COMMENT_ATTACHMENTS_${commentId}`;
  const { data: attachments } = useSWR(swrKey, () =>
    commentAttachmentService.getCommentAttachments(workspaceSlug, projectId, issueId, commentId)
  );

  const handleUpload = async (file: File) => {
    if (file.size > maxFileSize) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "File too large",
        message: `The file must be ${Math.floor(maxFileSize / 1024 / 1024)}MB or smaller.`,
      });
      return;
    }
    setIsUploading(true);
    try {
      await commentAttachmentService.uploadCommentAttachment(workspaceSlug, projectId, issueId, commentId, file);
      await mutate(swrKey);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Upload failed",
        message: (error as { error?: string })?.error ?? "The attachment could not be uploaded. Please try again.",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (assetId: string) => {
    try {
      await commentAttachmentService.deleteCommentAttachment(workspaceSlug, projectId, issueId, commentId, assetId);
      await mutate(swrKey);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not remove attachment",
        message: "You may not have permission to remove this attachment.",
      });
    }
  };

  const hasAttachments = (attachments ?? []).length > 0;
  if (disabled && !hasAttachments) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {previewAttachmentId && (
        <IssueAttachmentPreviewModal
          attachmentIds={(attachments ?? []).map((a) => a.id)}
          initialAttachmentId={previewAttachmentId}
          onClose={() => setPreviewAttachmentId(null)}
          resolveAttachment={(id) => (attachments ?? []).find((a) => a.id === id)}
        />
      )}
      {(attachments ?? []).map((attachment) => (
        <span
          key={attachment.id}
          className="group flex max-w-64 items-center gap-1.5 rounded-md border border-subtle-1 bg-layer-1 px-1.5 py-1"
        >
          <AttachmentThumbnail attachment={attachment} className="size-5" iconSize={14} />
          <button
            type="button"
            onClick={() => setPreviewAttachmentId(attachment.id)}
            className="min-w-0 truncate text-11 font-medium text-secondary hover:text-primary hover:underline"
            title={attachment.attributes?.name}
          >
            {attachment.attributes?.name}
          </button>
          <span className="shrink-0 text-10 text-tertiary">
            {attachment.attributes?.size ? convertBytesToSize(attachment.attributes.size) : ""}
          </span>
          {!disabled && (
            <button
              type="button"
              onClick={() => void handleDelete(attachment.id)}
              className="hidden size-4 shrink-0 place-items-center rounded text-tertiary hover:text-danger-secondary group-hover:grid"
              aria-label="Remove attachment"
            >
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
            }}
          />
          <Tooltip tooltipContent="Attach a file">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 rounded-md border border-dashed border-strong px-2 py-1 text-11 font-medium text-tertiary hover:bg-layer-1 hover:text-secondary disabled:opacity-60"
            >
              {isUploading ? <Loader2 className="size-3 animate-spin" /> : <Paperclip className="size-3" />}
              {isUploading ? "Uploading…" : hasAttachments ? "" : "Attach"}
            </button>
          </Tooltip>
        </>
      )}
    </div>
  );
});
