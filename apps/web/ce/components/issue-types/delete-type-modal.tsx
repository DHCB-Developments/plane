/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  typeId: string;
};

export const DeleteWorkItemTypeModal = observer(function DeleteWorkItemTypeModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, typeId } = props;
  const { t } = useTranslation();
  const { getIssueTypeById, deleteIssueType } = useIssueTypes();
  const issueType = getIssueTypeById(typeId);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteIssueType(workspaceSlug, projectId, typeId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("work_item_types.settings.item_delete_confirmation.toast.success.title"),
        message: t("work_item_types.settings.item_delete_confirmation.toast.success.message"),
      });
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("work_item_types.settings.item_delete_confirmation.toast.error.title"),
        message: error?.error ?? t("work_item_types.settings.item_delete_confirmation.toast.error.message"),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      handleSubmit={handleDelete}
      isSubmitting={isDeleting}
      title={t("work_item_types.settings.item_delete_confirmation.title")}
      content={
        <>
          {t("work_item_types.settings.item_delete_confirmation.description")}
          {issueType?.name ? ` (${issueType.name})` : ""}
        </>
      }
      primaryButtonText={{
        loading: "Deleting",
        default: t("work_item_types.settings.item_delete_confirmation.primary_button"),
      }}
    />
  );
});
