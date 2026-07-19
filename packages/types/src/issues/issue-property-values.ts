/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// property_id -> list of values (option ids, uuids, iso dates, decimals-as-string, text)
export type TIssuePropertyValues = Record<string, string[]>;
export type TIssuePropertyValueErrors = Record<string, unknown>;
