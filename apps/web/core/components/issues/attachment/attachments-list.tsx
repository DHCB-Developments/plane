/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// types
import type { TAttachmentHelpers } from "../issue-detail-widgets/attachments/helper";
// components
import { IssueAttachmentsDetail } from "./attachment-detail";
import { IssueAttachmentPreviewModal } from "./attachment-preview-modal";
import { IssueAttachmentsUploadDetails } from "./attachment-upload-details";

type TIssueAttachmentsList = {
  issueId: string;
  attachmentHelpers: TAttachmentHelpers;
  disabled?: boolean;
};

export const IssueAttachmentsList = observer(function IssueAttachmentsList(props: TIssueAttachmentsList) {
  const { issueId, attachmentHelpers, disabled } = props;
  // store hooks
  const {
    attachment: { getAttachmentsByIssueId },
  } = useIssueDetail();
  // states
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string | null>(null);
  // derived values
  const { snapshot: attachmentSnapshot } = attachmentHelpers;
  const { uploadStatus } = attachmentSnapshot;
  const issueAttachments = getAttachmentsByIssueId(issueId);

  return (
    <>
      {previewAttachmentId && issueAttachments && (
        <IssueAttachmentPreviewModal
          attachmentIds={issueAttachments}
          initialAttachmentId={previewAttachmentId}
          onClose={() => setPreviewAttachmentId(null)}
        />
      )}
      {uploadStatus?.map((uploadStatus) => (
        <IssueAttachmentsUploadDetails key={uploadStatus.id} uploadStatus={uploadStatus} />
      ))}
      {issueAttachments?.map((attachmentId) => (
        <IssueAttachmentsDetail
          key={attachmentId}
          attachmentId={attachmentId}
          disabled={disabled}
          attachmentHelpers={attachmentHelpers}
          onPreview={setPreviewAttachmentId}
        />
      ))}
    </>
  );
});
