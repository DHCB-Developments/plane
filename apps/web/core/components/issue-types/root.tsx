/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { Loader } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useProject } from "@/hooks/store/use-project";
// local imports
import { WorkItemTypesEnableView } from "./enable-view";
import { WorkItemPropertiesTab } from "./properties-tab";
import { WorkItemTypesTab } from "./types-tab";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const WorkItemTypesRoot = observer(function WorkItemTypesRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { fetchProjectIssueTypes, isWorkItemTypeEnabledForProject } = useIssueTypes();
  const { getProjectById } = useProject();
  const [activeTab, setActiveTab] = useState<"types" | "properties">("types");

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
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 border-b border-subtle-1">
        {(
          [
            { key: "types", label: "Work item types" },
            { key: "properties", label: "Properties" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-13 font-medium transition-colors ${
              activeTab === tab.key
                ? "border-accent-strong text-primary"
                : "border-transparent text-tertiary hover:text-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "types" ? (
        <WorkItemTypesTab workspaceSlug={workspaceSlug} projectId={projectId} />
      ) : (
        <WorkItemPropertiesTab workspaceSlug={workspaceSlug} projectId={projectId} />
      )}
    </div>
  );
});
