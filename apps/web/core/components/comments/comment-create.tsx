/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useForm, Controller } from "react-hook-form";
import { Loader2, Paperclip, X } from "lucide-react";
import { mutate } from "swr";
// plane imports
import { EIssueCommentAccessSpecifier } from "@plane/constants";
import type { EditorRefApi } from "@plane/editor";
import type { TIssueAttachment, TIssueComment, TCommentsOperations } from "@plane/types";
import { cn, isCommentEmpty } from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
// hooks
import { useFileSize } from "@/hooks/use-file-size";
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import { PendingCommentAttachmentService } from "@/services/issue/issue_attachment.service";
import { FileService } from "@/services/file.service";

type TCommentCreate = {
  entityId: string;
  workspaceSlug: string;
  activityOperations: TCommentsOperations;
  showToolbarInitially?: boolean;
  projectId?: string;
  onSubmitCallback?: (elementId: string) => void;
};

// services
const fileService = new FileService();
const pendingAttachmentService = new PendingCommentAttachmentService();

export const CommentCreate = observer(function CommentCreate(props: TCommentCreate) {
  const {
    workspaceSlug,
    entityId,
    activityOperations,
    showToolbarInitially = false,
    projectId,
    onSubmitCallback,
  } = props;
  // states
  const [uploadedAssetIds, setUploadedAssetIds] = useState<string[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<TIssueAttachment[]>([]);
  const [isAttaching, setIsAttaching] = useState(false);
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef<TIssueAttachment[]>([]);
  pendingAttachmentsRef.current = pendingAttachments;
  // hooks
  const { maxFileSize } = useFileSize();

  // Best-effort cleanup of uploads whose comment was never posted; the daily
  // purge task is the safety net when this never fires.
  useEffect(
    () => () => {
      if (!projectId) return;
      pendingAttachmentsRef.current.forEach((attachment) => {
        void pendingAttachmentService
          .deletePending(workspaceSlug, projectId.toString(), entityId, attachment.id)
          .catch(() => undefined);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  // store hooks
  const workspaceStore = useWorkspace();
  // derived values
  const workspaceId = workspaceStore.getWorkspaceBySlug(workspaceSlug)?.id as string;
  // form info
  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting },
    reset,
  } = useForm<Partial<TIssueComment>>({
    defaultValues: {
      comment_html: "<p></p>",
    },
  });

  const onSubmit = async (formData: Partial<TIssueComment>) => {
    try {
      const comment = await activityOperations.createComment(formData);
      if (comment?.id) onSubmitCallback?.(comment.id);
      if (comment?.id && projectId && pendingAttachments.length > 0) {
        await pendingAttachmentService.bind(
          workspaceSlug,
          projectId.toString(),
          entityId,
          comment.id,
          pendingAttachments.map((attachment) => attachment.id)
        );
        setPendingAttachments([]);
        await mutate(`COMMENT_ATTACHMENTS_${comment.id}`);
      }
      if (uploadedAssetIds.length > 0) {
        if (projectId) {
          await fileService.updateBulkProjectAssetsUploadStatus(workspaceSlug, projectId.toString(), entityId, {
            asset_ids: uploadedAssetIds,
          });
        } else {
          await fileService.updateBulkWorkspaceAssetsUploadStatus(workspaceSlug, entityId, {
            asset_ids: uploadedAssetIds,
          });
        }
        setUploadedAssetIds([]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      reset({
        comment_html: "<p></p>",
      });
      editorRef.current?.clearEditor();
    }
  };

  const commentHTML = watch("comment_html");
  const isEmpty = isCommentEmpty(commentHTML ?? undefined);

  return (
    <div
      className={cn("sticky bottom-0 z-[4] bg-surface-1 sm:static")}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !isEmpty &&
          !isSubmitting &&
          editorRef.current?.isEditorReadyToDiscard()
        )
          handleSubmit(onSubmit)(e);
      }}
    >
      <Controller
        name="access"
        control={control}
        render={({ field: { onChange: onAccessChange, value: accessValue } }) => (
          <Controller
            name="comment_html"
            control={control}
            render={({ field: { value, onChange } }) => (
              <LiteTextEditor
                editable
                workspaceId={workspaceId}
                id={"add_comment_" + entityId}
                value={"<p></p>"}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                onEnterKeyPress={(e) => {
                  if (!isEmpty && !isSubmitting) {
                    handleSubmit(onSubmit)(e);
                  }
                }}
                ref={editorRef}
                initialValue={value ?? "<p></p>"}
                containerClassName="min-h-min"
                onChange={(comment_json, comment_html) => onChange(comment_html)}
                accessSpecifier={accessValue ?? EIssueCommentAccessSpecifier.INTERNAL}
                handleAccessChange={onAccessChange}
                isSubmitting={isSubmitting}
                uploadFile={async (blockId, file) => {
                  const { asset_id } = await activityOperations.uploadCommentAsset(blockId, file);
                  setUploadedAssetIds((prev) => [...prev, asset_id]);
                  return asset_id;
                }}
                duplicateFile={async (assetId: string) => {
                  const { asset_id } = await activityOperations.duplicateCommentAsset(assetId);
                  setUploadedAssetIds((prev) => [...prev, asset_id]);
                  return asset_id;
                }}
                showToolbarInitially={showToolbarInitially}
                preToolbarContent={
                  pendingAttachments.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1">
                      {pendingAttachments.map((attachment) => (
                        <span
                          key={attachment.id}
                          className="flex max-w-64 items-center gap-1.5 rounded-md border border-subtle-1 bg-layer-1 px-1.5 py-0.5"
                        >
                          <span
                            className="min-w-0 truncate text-11 font-medium text-secondary"
                            title={attachment.attributes?.name}
                          >
                            {attachment.attributes?.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
                              void pendingAttachmentService
                                .deletePending(workspaceSlug, projectId?.toString() ?? "", entityId, attachment.id)
                                .catch(() => undefined);
                            }}
                            className="grid size-4 shrink-0 place-items-center rounded text-tertiary hover:text-danger-secondary"
                            aria-label="Remove attachment"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : undefined
                }
                toolbarExtraItems={
                  projectId ? (
                    <button
                      type="button"
                      disabled={isAttaching}
                      onClick={() => attachmentInputRef.current?.click()}
                      className="grid aspect-square place-items-center rounded-xs p-0.5 text-placeholder hover:bg-layer-1 disabled:opacity-60"
                      aria-label="Attach file"
                    >
                      {isAttaching ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                      ) : (
                        <Paperclip className="h-3.5 w-3.5" strokeWidth={2.5} />
                      )}
                    </button>
                  ) : undefined
                }
                parentClassName="p-2"
                displayConfig={{
                  fontSize: "small-font",
                }}
              />
            )}
          />
        )}
      />
      {projectId && (
        <span className="hidden">
          <input
            ref={attachmentInputRef}
            type="file"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > maxFileSize) {
                console.error("File exceeds the size limit");
                e.target.value = "";
                return;
              }
              setIsAttaching(true);
              try {
                const attachment = await pendingAttachmentService.uploadPending(
                  workspaceSlug,
                  projectId.toString(),
                  entityId,
                  file
                );
                setPendingAttachments((prev) => [...prev, attachment]);
              } catch (error) {
                console.error(error);
              } finally {
                setIsAttaching(false);
                if (attachmentInputRef.current) attachmentInputRef.current.value = "";
              }
            }}
          />
        </span>
      )}
    </div>
  );
});