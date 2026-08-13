/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TIssueIdentifierProps, TIssueIdentifierSize, TIssueTypeIdentifier } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
import { IdentifierText } from "@/components/issues/issue-detail/identifier-text";

const ISSUE_TYPE_ICON_SIZE: Record<TIssueIdentifierSize, number> = {
  xs: 16,
  sm: 18,
  md: 20,
  lg: 22,
};

// Convert a hex color to an rgba string with the given alpha, used to render the
// work item type badge as a light tint of its color (matches the EE design).
export const toTint = (color: string | undefined, alpha = 0.25): string | undefined => {
  if (!color) return undefined;
  const hex = color.replace("#", "").trim();
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return color;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const IssueIdentifier = observer(function IssueIdentifier(props: TIssueIdentifierProps) {
  const { projectId, variant, size, displayProperties, enableClickToCopyIdentifier = false } = props;
  // store hooks
  const { getProjectIdentifierById } = useProject();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  // Determine if the component is using store data or not
  const isUsingStoreData = "issueId" in props;
  // derived values
  const issue = isUsingStoreData ? getIssueById(props.issueId) : null;
  const projectIdentifier = isUsingStoreData ? getProjectIdentifierById(projectId) : props.projectIdentifier;
  const issueSequenceId = isUsingStoreData ? issue?.sequence_id : props.issueSequenceId;
  const issueTypeId = isUsingStoreData ? issue?.type_id : props.issueTypeId;
  // display property gates: the work item ID and the type icon are independent
  const shouldRenderIssueID = displayProperties ? displayProperties.key : true;
  const shouldRenderIssueTypeIcon = displayProperties ? !!displayProperties.issue_type : true;

  if (!shouldRenderIssueID && !shouldRenderIssueTypeIcon) return null;

  return (
    <div className="flex shrink-0 items-center space-x-2">
      {shouldRenderIssueTypeIcon && issueTypeId && <IssueTypeIdentifier issueTypeId={issueTypeId} size={size} />}
      {shouldRenderIssueID && (
        <IdentifierText
          identifier={`${projectIdentifier}-${issueSequenceId}`}
          enableClickToCopyIdentifier={enableClickToCopyIdentifier}
          variant={variant}
          size={size}
        />
      )}
    </div>
  );
});

export const IssueTypeIdentifier = observer(function IssueTypeIdentifier(props: TIssueTypeIdentifier) {
  const { issueTypeId, size = "sm" } = props;
  // store hooks
  const { getIssueTypeById } = useIssueTypes();
  // derived values
  const issueType = getIssueTypeById(issueTypeId);

  if (!issueType || !issueType.is_active || !issueType.logo_props?.in_use) return null;

  const badgeSize = ISSUE_TYPE_ICON_SIZE[size];
  const glyphSize = Math.round(badgeSize * 0.68);
  // Rounded badge tinted to the type color (25% alpha) with the full-color glyph
  // inside — matches the EE work item type design.
  const iconColor = issueType.logo_props.in_use === "icon" ? issueType.logo_props.icon?.color : undefined;
  const backgroundColor = toTint(iconColor, 0.25);

  return (
    <span
      className="grid shrink-0 place-items-center rounded-sm"
      style={{ height: badgeSize, width: badgeSize, backgroundColor }}
    >
      <Logo logo={issueType.logo_props} size={glyphSize} type="lucide" />
    </span>
  );
});
