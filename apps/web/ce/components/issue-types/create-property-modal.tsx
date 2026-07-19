/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssuePropertyType } from "@plane/types";
import { Button, Input, ModalCore, EModalWidth, CustomSearchSelect } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { DATE_FORMATS, PROPERTY_TYPE_OPTIONS, TEXT_FORMATS, getPropertyTypeMeta } from "./property-type-options";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
  propertyId?: string;
};

export const CreateUpdatePropertyModal = observer(function CreateUpdatePropertyModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, issueTypeId, propertyId } = props;
  const { t } = useTranslation();
  const { getPropertiesByTypeId, createIssueProperty, updateIssueProperty } = useIssueTypes();
  const existing = getPropertiesByTypeId(issueTypeId).find((p) => p.id === propertyId);
  // form state
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [propertyType, setPropertyType] = useState<TIssuePropertyType | undefined>(undefined);
  const [isMulti, setIsMulti] = useState(false);
  const [isRequired, setIsRequired] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [textFormat, setTextFormat] = useState("single_line");
  const [dateFormat, setDateFormat] = useState(DATE_FORMATS[0].key);
  const [numberDefault, setNumberDefault] = useState("");
  const [options, setOptions] = useState<{ id?: string; name: string }[]>([]);
  const [optionInput, setOptionInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(existing?.display_name ?? "");
    setDescription(existing?.description ?? "");
    setPropertyType(existing?.property_type);
    setIsMulti(existing?.is_multi ?? false);
    setIsRequired(existing?.is_required ?? false);
    setIsActive(existing?.is_active ?? true);
    setTextFormat((existing?.settings?.display_format as string) ?? "single_line");
    setDateFormat((existing?.settings?.display_format as string) ?? DATE_FORMATS[0].key);
    setNumberDefault(existing?.default_value?.[0] ?? "");
    setOptions((existing?.options ?? []).map((o) => ({ id: o.id, name: o.name })));
    setOptionInput("");
  }, [isOpen, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isBoolean = propertyType === "BOOLEAN";
  const isDropdown = propertyType === "OPTION";
  const isRelation = propertyType === "RELATION";
  const isText = propertyType === "TEXT";
  const isNumber = propertyType === "DECIMAL";
  const isDate = propertyType === "DATETIME";

  const addOption = () => {
    const name = optionInput.trim();
    if (!name) return;
    setOptions((prev) => [...prev, { name }]);
    setOptionInput("");
  };

  const onSubmit = async () => {
    if (!displayName.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Title is required" });
      return;
    }
    if (!propertyType) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Property type is required" });
      return;
    }
    if (isDropdown && options.length === 0) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Add at least one option" });
      return;
    }
    const meta = getPropertyTypeMeta(propertyType);
    const settings: Record<string, unknown> = {};
    if (isText) settings.display_format = textFormat;
    if (isDate) settings.display_format = dateFormat;
    const defaultValue: string[] = isNumber && numberDefault ? [numberDefault] : [];

    const payload = {
      display_name: displayName.trim(),
      description,
      property_type: propertyType,
      relation_type: meta?.relationType ?? null,
      is_multi: isDropdown || isRelation ? isMulti : false,
      is_required: isBoolean ? false : isRequired,
      is_active: isActive,
      settings,
      default_value: defaultValue,
      ...(isDropdown ? { options } : {}),
    };

    setIsSubmitting(true);
    try {
      if (propertyId) await updateIssueProperty(workspaceSlug, projectId, issueTypeId, propertyId, payload);
      else await createIssueProperty(workspaceSlug, projectId, issueTypeId, payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("work_item_types.settings.properties.toast.create.success.title"),
        message: t("work_item_types.settings.properties.toast.create.success.message"),
      });
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.display_name?.[0] ?? error?.is_required ?? error?.options ?? "Something went wrong.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const typeOptions = PROPERTY_TYPE_OPTIONS.map((option) => ({
    value: option.key,
    query: option.label,
    content: (
      <span className="flex items-center gap-2">
        <option.icon className="size-4 text-tertiary" /> {option.label}
      </span>
    ),
  }));

  const selectedMeta = propertyType ? getPropertyTypeMeta(propertyType) : undefined;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="flex items-center justify-between px-5 pt-5">
        <h4 className="text-16 font-medium text-secondary">
          {propertyId
            ? t("work_item_types.settings.properties.create_update.title.update")
            : t("work_item_types.settings.properties.create_update.title.create")}
        </h4>
        <button type="button" onClick={handleClose} className="text-tertiary hover:text-secondary">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
        <div>
          <span className="mb-1 block text-13 font-medium text-secondary">
            Title <span className="text-danger-secondary">*</span>
          </span>
          <Input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Title" className="w-full" />
        </div>
        <div>
          <span className="mb-1 block text-13 font-medium text-secondary">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className="min-h-20 w-full resize-none rounded-md border border-subtle bg-surface-1 p-3 text-13 text-secondary outline-none placeholder:text-placeholder"
          />
        </div>
        <div>
          <span className="mb-1 block text-13 font-medium text-secondary">
            Property type <span className="text-danger-secondary">*</span>
          </span>
          <CustomSearchSelect
            value={propertyType}
            options={typeOptions}
            onChange={(val: TIssuePropertyType) => setPropertyType(val)}
            disabled={!!propertyId}
            className="w-full"
            buttonClassName="w-full justify-between rounded-md border border-subtle px-3 py-2"
            label={
              selectedMeta ? (
                <span className="flex items-center gap-2 text-13">
                  <selectedMeta.icon className="size-4 text-tertiary" /> {selectedMeta.label}
                </span>
              ) : (
                <span className="text-13 text-placeholder">Select type</span>
              )
            }
          />
        </div>

        {(isDropdown || isRelation) && (
          <div>
            <span className="mb-1 block text-13 font-medium text-secondary">Attributes</span>
            <div className="flex gap-2">
              {[
                { key: false, label: "Single select" },
                { key: true, label: "Multi select" },
              ].map((attr) => (
                <button
                  key={String(attr.key)}
                  type="button"
                  onClick={() => setIsMulti(attr.key)}
                  className={`flex-1 rounded-md border px-3 py-2 text-13 ${
                    isMulti === attr.key ? "border-accent-strong bg-accent-subtle text-primary" : "border-subtle text-tertiary"
                  }`}
                >
                  {attr.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isText && (
          <div>
            <span className="mb-1 block text-13 font-medium text-secondary">Format</span>
            <div className="flex gap-2">
              {TEXT_FORMATS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setTextFormat(f.key)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-12 ${
                    textFormat === f.key ? "border-accent-strong bg-accent-subtle text-primary" : "border-subtle text-tertiary"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isDate && (
          <div>
            <span className="mb-1 block text-13 font-medium text-secondary">Format</span>
            <div className="grid grid-cols-2 gap-2">
              {DATE_FORMATS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setDateFormat(f.key)}
                  className={`rounded-md border px-2 py-1.5 text-12 ${
                    dateFormat === f.key ? "border-accent-strong bg-accent-subtle text-primary" : "border-subtle text-tertiary"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {isNumber && (
          <div>
            <span className="mb-1 block text-13 font-medium text-secondary">Default (Optional)</span>
            <Input type="number" value={numberDefault} onChange={(e) => setNumberDefault(e.target.value)} placeholder="Add number" className="w-full" />
          </div>
        )}

        {isDropdown && (
          <div>
            <span className="mb-1 block text-13 font-medium text-secondary">Options</span>
            <div className="flex gap-2">
              <Input
                type="text"
                value={optionInput}
                onChange={(e) => setOptionInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOption();
                  }
                }}
                placeholder="Add option"
                className="w-full"
              />
              <Button variant="neutral-primary" size="sm" onClick={addOption}>
                Add
              </Button>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {options.map((opt, idx) => (
                <div key={`${opt.name}-${idx}`} className="flex items-center justify-between rounded-md border border-subtle px-3 py-1.5 text-13">
                  <span>{opt.name}</span>
                  <button type="button" onClick={() => setOptions((prev) => prev.filter((_, i) => i !== idx))} className="text-tertiary hover:text-danger-secondary">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-subtle px-5 py-4">
        <div className="flex items-center gap-4">
          <label className={`flex items-center gap-2 text-13 ${isBoolean ? "opacity-50" : ""}`}>
            <input type="checkbox" checked={isRequired} disabled={isBoolean} onChange={(e) => setIsRequired(e.target.checked)} />
            Mandatory property
          </label>
          <label className="flex items-center gap-2 text-13">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onSubmit} loading={isSubmitting}>
            {propertyId ? "Update" : "Create"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
