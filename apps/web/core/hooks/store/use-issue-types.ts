/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
// context
import { StoreContext } from "@/lib/store-context";
// store
import type { IIssueTypesStore } from "@/plane-web/store/issue-types.store";

export const useIssueTypes = (): IIssueTypesStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useIssueTypes must be used within StoreProvider");
  return context.issueTypes;
};
