/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Search } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IIssueTypeAvailable } from "@plane/types";
import { Button, ModalCore, EModalWidth } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// plane web
import { toTint } from "@/components/issues/issue-detail/issue-identifier";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
};

export const ImportWorkItemTypesModal = observer(function ImportWorkItemTypesModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { fetchAvailableIssueTypes, importIssueType } = useIssueTypes();
  // states
  const [availableTypes, setAvailableTypes] = useState<IIssueTypeAvailable[] | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setAvailableTypes(undefined);
    setSelectedIds([]);
    setSearch("");
    fetchAvailableIssueTypes(workspaceSlug, projectId)
      .then((types) => setAvailableTypes(types))
      .catch(() => setAvailableTypes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceSlug, projectId]);

  const filtered = useMemo(
    () => (availableTypes ?? []).filter((type) => type.name.toLowerCase().includes(search.toLowerCase())),
    [availableTypes, search]
  );

  const toggleSelection = (typeId: string) =>
    setSelectedIds((prev) => (prev.includes(typeId) ? prev.filter((id) => id !== typeId) : [...prev, typeId]));

  const handleImport = async () => {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);
    try {
      await Promise.all(selectedIds.map((typeId) => importIssueType(workspaceSlug, projectId, typeId)));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: `${selectedIds.length} work item type${selectedIds.length > 1 ? "s" : ""} added to this project.`,
      });
      handleClose();
    } catch (error: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: error?.error ?? "Failed to import work item types." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="p-5 pb-3">
        <h4 className="text-16 font-medium text-secondary">
          {t("work_item_types.settings.types.project.add_button.import_from_workspace")}
        </h4>
        <div className="mt-3 flex h-9 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5">
          <Search className="size-3.5 text-placeholder" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search.label")}
            className="h-full w-full bg-transparent text-13 text-secondary outline-none placeholder:text-placeholder"
          />
        </div>
      </div>
      <div className="max-h-[50vh] min-h-32 space-y-2 overflow-y-auto px-5 pb-3">
        {availableTypes === undefined ? (
          <p className="py-8 text-center text-13 text-tertiary">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-13 font-medium text-secondary">No types available</p>
            <p className="mt-1 text-12 text-tertiary">
              Every workspace work item type is already linked to this project.
            </p>
          </div>
        ) : (
          filtered.map((type) => {
            const iconColor = type.logo_props?.in_use === "icon" ? type.logo_props.icon?.color : undefined;
            const isSelected = selectedIds.includes(type.id);
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => toggleSelection(type.id)}
                className={`flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors ${
                  isSelected ? "border-accent-strong bg-accent-subtle" : "border-subtle hover:bg-layer-1"
                }`}
              >
                <input type="checkbox" checked={isSelected} readOnly className="pointer-events-none" />
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-md"
                  style={{ backgroundColor: toTint(iconColor, 0.25) }}
                >
                  <Logo logo={type.logo_props} size={16} type="lucide" />
                </span>
                <span className="flex grow flex-col overflow-hidden">
                  <span className="truncate text-13 font-medium text-primary">{type.name}</span>
                  {type.description && <span className="truncate text-12 text-tertiary">{type.description}</span>}
                </span>
                <span className="shrink-0 text-11 text-tertiary">
                  {type.usage_count} project{type.usage_count === 1 ? "" : "s"} · {type.properties_count}{" "}
                  {type.properties_count === 1 ? "property" : "properties"}
                </span>
              </button>
            );
          })
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-4">
        <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleImport} loading={isSubmitting} disabled={selectedIds.length === 0}>
          Add
        </Button>
      </div>
    </ModalCore>
  );
});
