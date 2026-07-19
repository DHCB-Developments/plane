/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlignLeft, Calendar, CircleChevronDown, Hash, Link2, ToggleLeft, Users } from "lucide-react";
import type { TIssuePropertyType } from "@plane/types";

export const PROPERTY_TYPE_OPTIONS: {
  key: TIssuePropertyType;
  label: string;
  icon: typeof AlignLeft;
  relationType?: "USER";
}[] = [
  { key: "TEXT", label: "Text", icon: AlignLeft },
  { key: "DECIMAL", label: "Number", icon: Hash },
  { key: "OPTION", label: "Dropdown", icon: CircleChevronDown },
  { key: "BOOLEAN", label: "Boolean", icon: ToggleLeft },
  { key: "DATETIME", label: "Date", icon: Calendar },
  { key: "RELATION", label: "Member picker", icon: Users, relationType: "USER" },
  { key: "URL", label: "URL", icon: Link2 },
];

export const TEXT_FORMATS = [
  { key: "single_line", label: "Single line" },
  { key: "paragraph", label: "Paragraph" },
  { key: "readonly", label: "Read-only" },
];

export const DATE_FORMATS = [
  { key: "MMM dd, yyyy", label: "Jan 15, 2025" },
  { key: "dd/MM/yyyy", label: "15/01/2025" },
  { key: "MM/dd/yyyy", label: "01/15/2025" },
  { key: "yyyy/MM/dd", label: "2025/01/15" },
];

export const getPropertyTypeMeta = (type: TIssuePropertyType) =>
  PROPERTY_TYPE_OPTIONS.find((option) => option.key === type);
