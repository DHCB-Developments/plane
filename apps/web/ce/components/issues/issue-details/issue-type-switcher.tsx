/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Tooltip } from "@plane/propel/tooltip";
import { CustomSearchSelect } from "@plane/ui";
// hooks
import { IdentifierText } from "@/components/issues/issue-detail/identifier-text";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
// local imports
import { IssueIdentifier, toTint } from "./issue-identifier";

export type TIssueTypeSwitcherProps = {
  issueId: string;
  disabled: boolean;
};

export const IssueTypeSwitcher = observer(function IssueTypeSwitcher(props: TIssueTypeSwitcherProps) {
  const { issueId, disabled } = props;
  const { workspaceSlug: workspaceSlugParam } = useParams();
  const workspaceSlug = workspaceSlugParam?.toString() ?? "";
  // store hooks
  const {
    issue: { getIssueById },
    updateIssue,
  } = useIssueDetail();
  const { getProjectIssueTypes, getIssueTypeById, isWorkItemTypeEnabledForProject } = useIssueTypes();
  const { getProjectIdentifierById } = useProject();
  // derived values
  const issue = getIssueById(issueId);

  if (!issue || !issue.project_id) return <></>;
  const projectId = issue.project_id;
  const currentType = getIssueTypeById(issue.type_id);
  const activeTypes = (getProjectIssueTypes(projectId) ?? []).filter((type) => type.is_active);

  // Plain identifier when the feature is off for the project or there is nothing to pick.
  if (!isWorkItemTypeEnabledForProject(projectId) || activeTypes.length === 0) {
    return <IssueIdentifier issueId={issueId} projectId={projectId} size="md" enableClickToCopyIdentifier />;
  }

  const projectIdentifier = getProjectIdentifierById(projectId);
  const currentColor = currentType?.logo_props?.in_use === "icon" ? currentType.logo_props.icon?.color : undefined;

  const options = activeTypes.map((type) => {
    const color = type.logo_props?.in_use === "icon" ? type.logo_props.icon?.color : undefined;
    return {
      value: type.id,
      query: type.name,
      content: (
        <div className="flex items-center gap-2">
          <span className="grid size-4 place-items-center rounded-sm" style={{ backgroundColor: toTint(color, 0.25) }}>
            <Logo logo={type.logo_props} size={11} type="lucide" />
          </span>
          <span className="flex-grow truncate">{type.name}</span>
        </div>
      ),
    };
  });

  // An untyped work item (e.g. created via quick-add before the backend fallback
  // existed) gets an explicit "Set type" affordance instead of no control at all.
  const pill = currentType ? (
    <span
      className="flex items-center gap-1 rounded px-1.5 py-1 text-13 font-medium"
      style={{ backgroundColor: toTint(currentColor, 0.25), color: currentColor }}
    >
      <Logo logo={currentType.logo_props} size={14} type="lucide" />
      <span className="truncate">{currentType.name}</span>
    </span>
  ) : (
    <span className="flex items-center gap-1 rounded border border-dashed border-strong px-1.5 py-1 text-13 text-tertiary">
      Set type
    </span>
  );

  return (
    <div className="flex items-center gap-2">
      <CustomSearchSelect
        value={issue.type_id}
        options={options}
        disabled={disabled}
        onChange={(value: string) => {
          if (value && value !== issue.type_id) updateIssue(workspaceSlug, projectId, issueId, { type_id: value });
        }}
        noChevron
        customButton={
          <Tooltip tooltipContent={currentType ? "Switch work item type" : "Set work item type"} disabled={disabled}>
            {pill}
          </Tooltip>
        }
      />
      <IdentifierText identifier={`${projectIdentifier}-${issue.sequence_id}`} enableClickToCopyIdentifier size="md" />
    </div>
  );
});
