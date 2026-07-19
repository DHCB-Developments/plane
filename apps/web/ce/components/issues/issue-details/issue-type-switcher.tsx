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

  // Fall back to the plain identifier when work item types are not enabled for the
  // project or the issue has no resolvable type.
  if (!isWorkItemTypeEnabledForProject(projectId) || !currentType) {
    return <IssueIdentifier issueId={issueId} projectId={projectId} size="md" enableClickToCopyIdentifier />;
  }

  const projectIdentifier = getProjectIdentifierById(projectId);
  const activeTypes = (getProjectIssueTypes(projectId) ?? []).filter((type) => type.is_active);
  const currentColor = currentType.logo_props?.in_use === "icon" ? currentType.logo_props.icon?.color : undefined;

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
          <Tooltip tooltipContent="Switch work item type" disabled={disabled}>
            <span
              className="flex items-center gap-1 rounded px-1.5 py-1 text-13 font-medium"
              style={{ backgroundColor: toTint(currentColor, 0.25), color: currentColor }}
            >
              <Logo logo={currentType.logo_props} size={14} type="lucide" />
              <span className="truncate">{currentType.name}</span>
            </span>
          </Tooltip>
        }
      />
      <IdentifierText identifier={`${projectIdentifier}-${issue.sequence_id}`} enableClickToCopyIdentifier size="md" />
    </div>
  );
});
