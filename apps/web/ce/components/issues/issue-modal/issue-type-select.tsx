/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import useSWR from "swr";
import { useParams } from "next/navigation";
import { Controller } from "react-hook-form";
import type { Control, Path } from "react-hook-form";
import { ChevronDown } from "lucide-react";
// plane imports
import type { EditorRefApi } from "@plane/editor";
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TBulkIssueProperties, TIssue } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

export type TIssueFields = TIssue & TBulkIssueProperties;

export type TIssueTypeDropdownVariant = "xs" | "sm";

export type TIssueTypeSelectProps<T extends Partial<TIssueFields>> = {
  control: Control<T>;
  projectId: string | null;
  editorRef?: React.MutableRefObject<EditorRefApi | null>;
  disabled?: boolean;
  variant?: TIssueTypeDropdownVariant;
  placeholder?: string;
  isRequired?: boolean;
  renderChevron?: boolean;
  dropDownContainerClassName?: string;
  showMandatoryFieldInfo?: boolean;
  handleFormChange?: () => void;
};

export function IssueTypeSelect<T extends Partial<TIssueFields>>(props: TIssueTypeSelectProps<T>) {
  const { control, projectId, disabled, handleFormChange, renderChevron } = props;
  // store hooks
  const { getProjectIssueTypes, getIssueTypeById, fetchProjectIssueTypes } = useIssueTypes();
  const { workspaceSlug } = useParams();
  // ensure the project's work item types are loaded even when the modal is opened
  // for a project the user has not visited yet
  useSWR(
    workspaceSlug && projectId ? `PROJECT_ISSUE_TYPES_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchProjectIssueTypes(workspaceSlug.toString(), projectId) : null,
    { revalidateOnFocus: false }
  );
  // derived values
  const types = (getProjectIssueTypes(projectId) ?? []).filter((type) => type.is_active && !type.is_epic);

  if (types.length === 0) return null;

  return (
    <Controller
      name={"type_id" as Path<T>}
      control={control}
      render={({ field: { value, onChange } }) => {
        const current = getIssueTypeById(value as string | undefined);
        const options = types.map((type) => ({
          value: type.id,
          query: type.name,
          content: (
            <span className="flex items-center gap-2">
              <Logo logo={type.logo_props} size={14} type="lucide" /> {type.name}
            </span>
          ),
        }));
        return (
          <CustomSearchSelect
            value={value as string}
            options={options}
            disabled={disabled}
            onChange={(val: string) => {
              onChange(val);
              handleFormChange?.();
            }}
            noChevron
            customButton={
              <span className="flex items-center gap-1 rounded border border-subtle px-1.5 py-1 text-13 text-secondary">
                {current?.logo_props?.in_use ? <Logo logo={current.logo_props} size={14} type="lucide" /> : null}
                <span>{current?.name ?? "Type"}</span>
                {renderChevron && <ChevronDown className="size-3.5 text-tertiary" />}
              </span>
            }
          />
        );
      }}
    />
  );
}
