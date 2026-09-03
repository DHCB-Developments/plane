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
import { AlertModalCore, CustomMenu, ToggleSwitch } from "@plane/ui";
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
  const { getPropertiesByTypeId, updateIssueProperty, detachIssueProperty, getIssuePropertyDetachImpact } =
    useIssueTypes();
  const property = getPropertiesByTypeId(issueTypeId).find((p) => p.id === propertyId);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [detachImpact, setDetachImpact] = useState<number | null>(null);
  const [clearValues, setClearValues] = useState(true);
  const [isDetaching, setIsDetaching] = useState(false);

  if (!property) return null;
  const meta = getPropertyTypeMeta(property.property_type);
  const Icon = meta?.icon;
  const isBoolean = property.property_type === "BOOLEAN";

  const toggleLink = async (field: "is_required" | "is_active", value: boolean) => {
    try {
      await updateIssueProperty(workspaceSlug, projectId, issueTypeId, propertyId, { [field]: value });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: (error as { error?: string })?.error ?? "Could not update." });
    }
  };

  const openDetach = async () => {
    try {
      const impact = await getIssuePropertyDetachImpact(workspaceSlug, projectId, issueTypeId, propertyId);
      setClearValues(true);
      setDetachImpact(impact.issues_with_values);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not check existing values." });
    }
  };

  const handleDetach = async () => {
    setIsDetaching(true);
    try {
      await detachIssueProperty(workspaceSlug, projectId, issueTypeId, propertyId, clearValues);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Property detached", message: `${property.display_name} no longer applies to this type here.` });
      setDetachImpact(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to detach property." });
    } finally {
      setIsDetaching(false);
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
        mode="type"
      />
      <AlertModalCore
        isOpen={detachImpact !== null}
        handleClose={() => setDetachImpact(null)}
        handleSubmit={() => void handleDetach()}
        isSubmitting={isDetaching}
        title={`Detach "${property.display_name}" from this type?`}
        content={
          <div className="space-y-3">
            <p>
              The property stays in the library and keeps working anywhere else it&apos;s attached — only this
              type in this project loses it.
            </p>
            {detachImpact !== null && detachImpact > 0 ? (
              <label className="flex items-start gap-2 rounded-md border border-subtle-1 p-3 text-13">
                <input type="checkbox" checked={clearValues} onChange={(e) => setClearValues(e.target.checked)} className="mt-0.5" />
                <span>
                  Also clear its values on the{" "}
                  <span className="font-medium">
                    {detachImpact} work item{detachImpact === 1 ? "" : "s"}
                  </span>{" "}
                  in this project that have one. Unchecked, the values stay stored but hidden.
                </span>
              </label>
            ) : (
              <p className="text-12 text-tertiary">No work items in this project have a value for it.</p>
            )}
          </div>
        }
        primaryButtonText={{ loading: "Detaching", default: "Detach" }}
      />
      <div className="flex items-center gap-3 rounded-md border border-subtle bg-surface-1 px-3 py-2.5">
        {Icon && <Icon className="size-4 shrink-0 text-tertiary" />}
        <span className="min-w-0 grow">
          <span className="block truncate text-13 text-primary">{property.display_name}</span>
          {property.description && <span className="block truncate text-11 text-tertiary">{property.description}</span>}
        </span>
        <label className={`flex items-center gap-1.5 text-11 text-tertiary ${isBoolean ? "opacity-50" : ""}`}>
          {t("common.mandatory", { defaultValue: "Mandatory" })}
          <ToggleSwitch
            value={property.is_required}
            onChange={() => void toggleLink("is_required", !property.is_required)}
            disabled={isBoolean}
            size="sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-11 text-tertiary">
          {t("common.active")}
          <ToggleSwitch value={property.is_active} onChange={() => void toggleLink("is_active", !property.is_active)} size="sm" />
        </label>
        <CustomMenu placement="bottom-end" ellipsis>
          <CustomMenu.MenuItem onClick={() => setIsEditOpen(true)}>
            <span className="flex items-center gap-2">
              <Pencil className="size-3.5" /> {t("common.edit")}
            </span>
          </CustomMenu.MenuItem>
          <CustomMenu.MenuItem onClick={() => void openDetach()}>
            <span className="flex items-center gap-2 text-danger-secondary">
              <Unlink className="size-3.5" /> Detach from this type
            </span>
          </CustomMenu.MenuItem>
        </CustomMenu>
      </div>
    </>
  );
});
