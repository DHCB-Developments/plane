/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

export type TIssuePropertyType = "TEXT" | "DECIMAL" | "OPTION" | "BOOLEAN" | "DATETIME" | "RELATION" | "URL";

export type TIssuePropertyRelationType = "USER" | "ISSUE";

export interface IIssuePropertyOption {
  id: string;
  name: string;
  description: string;
  logo_props: TLogoProps | undefined;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  property: string;
}

export interface IIssueProperty {
  id: string;
  display_name: string;
  description: string;
  logo_props: TLogoProps | undefined;
  property_type: TIssuePropertyType;
  relation_type: TIssuePropertyRelationType | null;
  is_required: boolean;
  is_active: boolean;
  is_multi: boolean;
  default_value: string[];
  settings: Record<string, unknown>;
  sort_order: number;
  issue_type: string;
  options: IIssuePropertyOption[];
}

export type TIssuePropertyOptionPayload = {
  id?: string;
  name?: string;
  description?: string;
  logo_props?: TLogoProps;
  is_active?: boolean;
  is_default?: boolean;
};

export type TIssuePropertyPayload = {
  display_name?: string;
  description?: string;
  logo_props?: TLogoProps;
  property_type?: TIssuePropertyType;
  relation_type?: TIssuePropertyRelationType | null;
  is_required?: boolean;
  is_active?: boolean;
  is_multi?: boolean;
  default_value?: string[];
  settings?: Record<string, unknown>;
  options?: TIssuePropertyOptionPayload[];
};

