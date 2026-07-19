/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Pencil, Unlink } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, CustomMenu } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { CreateUpdatePropertyModal } from "./create-property-modal";
import { getPropertyTypeMeta } from "./property-type-options";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
  propertyId: string;
};

export const PropertyItem = observer(function PropertyItem(props: Props) {
  const { workspaceSlug, projectId, issueTypeId, propertyId } = props;
  const { t } = useTranslation();
  const { getPropertiesByTypeId, deleteIssueProperty } = useIssueTypes();
  const property = getPropertiesByTypeId(issueTypeId).find((p) => p.id === propertyId);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!property) return null;
  const meta = getPropertyTypeMeta(property.property_type);
  const Icon = meta?.icon;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteIssueProperty(workspaceSlug, projectId, issueTypeId, propertyId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("work_item_types.settings.properties.toast.delete.success.title"),
        message: t("work_item_types.settings.properties.toast.delete.success.message"),
      });
      setIsDeleteOpen(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to delete property." });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <CreateUpdatePropertyModal
        isOpen={isEditOpen}
        handleClose={() => setIsEditOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueTypeId={issueTypeId}
        propertyId={propertyId}
      />
      <AlertModalCore
        isOpen={isDeleteOpen}
        handleClose={() => setIsDeleteOpen(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("work_item_types.settings.linked_properties.unlink_confirmation.title")}
        content={t("work_item_types.settings.linked_properties.unlink_confirmation.description")}
        primaryButtonText={{
          loading: t("work_item_types.settings.linked_properties.unlink_confirmation.loading"),
          default: t("work_item_types.settings.linked_properties.unlink_confirmation.confirm"),
        }}
      />
      <div className="flex items-center gap-3 rounded-md border border-subtle bg-surface-1 px-3 py-2.5">
        {Icon && <Icon className="size-4 shrink-0 text-tertiary" />}
        <span className="grow truncate text-13 text-primary">{property.display_name}</span>
        {property.is_required && (
          <span className="text-11 font-medium text-accent-primary">
            {t("common.mandatory", { defaultValue: "Mandatory" })}
          </span>
        )}
        <span className="text-11 text-tertiary">{property.is_active ? t("common.active") : t("common.disabled")}</span>
        <CustomMenu placement="bottom-end" ellipsis>
          <CustomMenu.MenuItem onClick={() => setIsEditOpen(true)}>
            <span className="flex items-center gap-2">
              <Pencil className="size-3.5" /> {t("common.edit")}
            </span>
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={() => setIsDeleteOpen(true)}>
            <span className="flex items-center gap-2 text-danger-secondary">
              <Unlink className="size-3.5" /> {t("work_item_types.settings.linked_properties.unlink_confirmation.title")}
            </span>
          </CustomMenu.MenuItem>
        </CustomMenu>
      </div>
    </>
  );
});
