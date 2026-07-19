/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TLogoProps } from "../common";

export interface IIssueType {
  id: string;
  name: string;
  description: string;
  logo_props: TLogoProps | undefined;
  is_epic: boolean;
  is_active: boolean;
  is_default: boolean;
  level: number;
  workspace_id: string;
  external_source: string | null;
  external_id: string | null;
}

export type TIssueTypePayload = {
  name?: string;
  description?: string;
  logo_props?: TLogoProps;
  is_active?: boolean;
};
