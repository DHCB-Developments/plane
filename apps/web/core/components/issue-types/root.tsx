/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { Loader } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
// local imports
import { WorkItemTypesEnableView } from "./enable-view";
import { WorkItemTypesTab } from "./types-tab";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const WorkItemTypesRoot = observer(function WorkItemTypesRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { fetchProjectIssueTypes, isWorkItemTypeEnabledForProject } = useIssueTypes();
  const { getProjectById } = useProject();

  const project = getProjectById(projectId);
  const isEnabled = !!project?.is_issue_type_enabled || isWorkItemTypeEnabledForProject(projectId);

  const { isLoading } = useSWR(
    workspaceSlug && projectId && isEnabled ? `PROJECT_ISSUE_TYPES_SETTINGS_${projectId}` : null,
    workspaceSlug && projectId && isEnabled ? () => fetchProjectIssueTypes(workspaceSlug, projectId) : null,
    { revalidateOnFocus: false }
  );

  if (!isEnabled) return <WorkItemTypesEnableView workspaceSlug={workspaceSlug} projectId={projectId} />;

  return isLoading ? (
    <Loader className="flex flex-col gap-3">
      <Loader.Item height="64px" />
      <Loader.Item height="64px" />
    </Loader>
  ) : (
    <WorkItemTypesTab workspaceSlug={workspaceSlug} projectId={projectId} />
  );
});
