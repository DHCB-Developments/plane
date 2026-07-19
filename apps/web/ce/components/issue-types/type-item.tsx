/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ChevronRight, Pencil, Trash2 } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ToggleSwitch, CustomMenu, Tooltip } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// plane web
import { toTint } from "@/plane-web/components/issues/issue-details/issue-identifier";
// local imports
import { CreateUpdateWorkItemTypeModal } from "./create-update-type-modal";
import { DeleteWorkItemTypeModal } from "./delete-type-modal";
import { TypePropertiesSection } from "./type-properties-section";

type Props = {
  workspaceSlug: string;
  projectId: string;
  typeId: string;
};

export const WorkItemTypeItem = observer(function WorkItemTypeItem(props: Props) {
  const { workspaceSlug, projectId, typeId } = props;
  const { t } = useTranslation();
  const { getIssueTypeById, updateIssueType, markAsDefault } = useIssueTypes();
  const issueType = getIssueTypeById(typeId);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  if (!issueType) return null;
  const iconColor = issueType.logo_props?.in_use === "icon" ? issueType.logo_props.icon?.color : undefined;

  const handleToggleActive = async () => {
    try {
      await updateIssueType(workspaceSlug, projectId, typeId, { is_active: !issueType.is_active });
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: error?.error ?? "Failed to update work item type." });
    }
  };

  const handleSetDefault = async () => {
    try {
      await markAsDefault(workspaceSlug, projectId, typeId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to set default." });
    }
  };

  return (
    <>
      <CreateUpdateWorkItemTypeModal
        isOpen={isEditOpen}
        handleClose={() => setIsEditOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        typeId={typeId}
      />
      <DeleteWorkItemTypeModal
        isOpen={isDeleteOpen}
        handleClose={() => setIsDeleteOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        typeId={typeId}
      />
      <div className="rounded-lg bg-surface-2">
        <div className="flex items-center gap-3 px-3 py-3">
          <button type="button" onClick={() => setIsExpanded((p) => !p)} className="shrink-0 text-tertiary">
            <ChevronRight className={`size-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          </button>
          <span
            className="grid size-9 shrink-0 place-items-center rounded-md"
            style={{ backgroundColor: toTint(iconColor, 0.25) }}
          >
            <Logo logo={issueType.logo_props} size={18} type="lucide" />
          </span>
          <div className="flex grow flex-col overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="truncate text-14 font-medium text-primary">{issueType.name}</span>
              {issueType.is_default && (
                <span className="rounded border border-subtle px-1.5 py-0.5 text-11 text-tertiary">
                  {t("common.default")}
                </span>
              )}
            </div>
            {issueType.description && (
              <span className="truncate text-13 text-tertiary">{issueType.description}</span>
            )}
          </div>
          <Tooltip
            tooltipContent={t("work_item_types.enable_disable.tooltip", {
              action: issueType.is_active ? "disable" : "enable",
            })}
          >
            <div>
              <ToggleSwitch value={issueType.is_active} onChange={handleToggleActive} disabled={issueType.is_default} />
            </div>
          </Tooltip>
          {!issueType.is_default && (
            <CustomMenu placement="bottom-end" ellipsis>
              <CustomMenu.MenuItem onClick={() => setIsEditOpen(true)}>
                <span className="flex items-center gap-2">
                  <Pencil className="size-3.5" /> {t("common.edit")}
                </span>
              </CustomMenu.MenuItem>
              <CustomMenu.MenuItem onClick={handleSetDefault} disabled={!issueType.is_active}>
                <span className="flex items-center gap-2">{t("work_item_types.settings.set_as_default")}</span>
              </CustomMenu.MenuItem>
              <CustomMenu.MenuItem onClick={() => setIsDeleteOpen(true)}>
                <span className="flex items-center gap-2 text-danger-secondary">
                  <Trash2 className="size-3.5" /> {t("common.delete")}
                </span>
              </CustomMenu.MenuItem>
            </CustomMenu>
          )}
        </div>
        {isExpanded && (
          <div className="border-t border-subtle px-4 py-3">
            <TypePropertiesSection workspaceSlug={workspaceSlug} projectId={projectId} issueTypeId={typeId} />
          </div>
        )}
      </div>
    </>
  );
});
