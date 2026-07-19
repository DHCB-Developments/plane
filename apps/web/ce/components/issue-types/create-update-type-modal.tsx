/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EmojiPicker, EmojiIconPickerTypes, Logo } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TLogoProps } from "@plane/types";
import { Button, Input, ModalCore, EModalWidth } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// plane web
import { toTint } from "@/plane-web/components/issues/issue-details/issue-identifier";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  typeId?: string;
};

export const CreateUpdateWorkItemTypeModal = observer(function CreateUpdateWorkItemTypeModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, typeId } = props;
  const { t } = useTranslation();
  const { getIssueTypeById, createIssueType, updateIssueType } = useIssueTypes();
  const issueType = getIssueTypeById(typeId);
  // states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoProps, setLogoProps] = useState<TLogoProps | undefined>(undefined);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(issueType?.name ?? "");
      setDescription(issueType?.description ?? "");
      setLogoProps(issueType?.logo_props);
    }
  }, [isOpen, issueType?.name, issueType?.description, issueType?.logo_props]);

  const iconColor = logoProps?.in_use === "icon" ? logoProps.icon?.color : undefined;

  const onSubmit = async () => {
    if (!name.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Name is required" });
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = { name: name.trim(), description, logo_props: logoProps };
      if (typeId) await updateIssueType(workspaceSlug, projectId, typeId, payload);
      else await createIssueType(workspaceSlug, projectId, payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("work_item_types.create.toast.success.title"),
        message: typeId
          ? t("work_item_types.update.toast.success.message", { name })
          : t("work_item_types.create.toast.success.message"),
      });
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.name?.[0] ?? error?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="p-5">
        <h4 className="text-16 font-medium text-secondary">
          {typeId ? t("work_item_types.update.title") : t("work_item_types.create.title")}
        </h4>
        <div className="mt-4 flex items-center gap-2">
          <EmojiPicker
            iconType="lucide"
            isOpen={isEmojiOpen}
            handleToggle={(val: boolean) => setIsEmojiOpen(val)}
            className="flex items-center justify-center"
            buttonClassName="flex items-center justify-center"
            label={
              <span
                className="grid size-9 place-items-center rounded-md border border-subtle"
                style={{ backgroundColor: toTint(iconColor, 0.25) }}
              >
                <Logo logo={logoProps} size={18} type="lucide" />
              </span>
            }
            onChange={(val: any) => {
              let logoValue: Record<string, unknown> = {};
              if (val?.type === "emoji") logoValue = { value: val.value };
              else if (val?.type === "icon")
                logoValue = { name: val.value?.name, color: val.value?.color, background_color: val.value?.color };
              setLogoProps({ in_use: val?.type, [val?.type]: logoValue } as TLogoProps);
              setIsEmojiOpen(false);
            }}
            defaultIconColor={iconColor}
            defaultOpen={EmojiIconPickerTypes.ICON}
          />
          <Input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("work_item_types.create_update.form.name.placeholder")}
            className="w-full"
          />
        </div>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("work_item_types.create_update.form.description.placeholder")}
          className="mt-3 min-h-24 w-full resize-none rounded-md border border-subtle bg-surface-1 p-3 text-13 text-secondary outline-none placeholder:text-placeholder"
        />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 py-4">
        <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onSubmit} loading={isSubmitting}>
          {typeId ? t("work_item_types.update.button") : t("work_item_types.create.button")}
        </Button>
      </div>
    </ModalCore>
  );
});
