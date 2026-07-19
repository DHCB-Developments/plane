/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { IIssueProperty } from "@plane/types";
import { ToggleSwitch, CustomSearchSelect } from "@plane/ui";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";

type Props = {
  property: IIssueProperty;
  values: string[];
  onChange: (values: string[]) => void;
  projectId: string;
  disabled?: boolean;
};

export const PropertyValueInput = observer(function PropertyValueInput(props: Props) {
  const { property, values, onChange, projectId, disabled } = props;
  const type = property.property_type;
  const first = values?.[0] ?? "";
  const inputClass =
    "w-full rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-13 text-secondary outline-none placeholder:text-placeholder disabled:opacity-60";

  if (type === "TEXT") {
    if (property.settings?.display_format === "readonly") {
      return <span className="text-13 text-secondary">{first || "—"}</span>;
    }
    if (property.settings?.display_format === "paragraph") {
      return (
        <textarea
          value={first}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
          placeholder="Add text"
          className={`${inputClass} min-h-16 resize-none`}
        />
      );
    }
    return (
      <input
        type="text"
        value={first}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
        placeholder="Add text"
        className={inputClass}
      />
    );
  }

  if (type === "URL") {
    return (
      <input
        type="url"
        value={first}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
        placeholder="Add URL"
        className={inputClass}
      />
    );
  }

  if (type === "DECIMAL") {
    return (
      <input
        type="number"
        value={first}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
        placeholder="Add number"
        className={inputClass}
      />
    );
  }

  if (type === "BOOLEAN") {
    return <ToggleSwitch value={first === "true"} onChange={(val) => onChange([String(val)])} disabled={disabled} />;
  }

  if (type === "DATETIME") {
    return (
      <input
        type="date"
        value={first ? first.slice(0, 10) : ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
        className={inputClass}
      />
    );
  }

  if (type === "OPTION") {
    const options = (property.options ?? [])
      .filter((o) => o.is_active)
      .map((o) => ({ value: o.id, query: o.name, content: <span className="text-13">{o.name}</span> }));
    const selectedLabel = property.is_multi
      ? (property.options ?? []).filter((o) => values.includes(o.id)).map((o) => o.name).join(", ")
      : property.options?.find((o) => o.id === first)?.name;
    const optionButtonClass = "w-full justify-between rounded-md border border-subtle px-2.5 py-1.5";
    const optionLabel = <span className="text-13 text-secondary">{selectedLabel || "Select"}</span>;
    if (property.is_multi) {
      return (
        <CustomSearchSelect
          multiple
          value={values}
          options={options}
          disabled={disabled}
          onChange={(val: string[]) => onChange(val ?? [])}
          className="w-full"
          buttonClassName={optionButtonClass}
          label={optionLabel}
        />
      );
    }
    return (
      <CustomSearchSelect
        value={first}
        options={options}
        disabled={disabled}
        onChange={(val: string) => onChange(val ? [val] : [])}
        className="w-full"
        buttonClassName={optionButtonClass}
        label={optionLabel}
      />
    );
  }

  if (type === "RELATION") {
    if (property.is_multi) {
      return (
        <MemberDropdown
          multiple
          value={values}
          projectId={projectId}
          disabled={disabled}
          onChange={(val: string[]) => onChange(val ?? [])}
          buttonVariant="transparent-with-text"
        />
      );
    }
    return (
      <MemberDropdown
        multiple={false}
        value={first || null}
        projectId={projectId}
        disabled={disabled}
        onChange={(val: string | null) => onChange(val ? [val] : [])}
        buttonVariant="border-with-text"
      />
    );
  }

  return null;
});
