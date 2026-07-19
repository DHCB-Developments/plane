/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Layers, ListFilter, Network } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
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

type TTab = "types" | "properties" | "hierarchy";

export const WorkItemTypesRoot = observer(function WorkItemTypesRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { fetchProjectIssueTypes, isWorkItemTypeEnabledForProject } = useIssueTypes();
  const { getProjectById } = useProject();
  const [tab, setTab] = useState<TTab>("types");

  const project = getProjectById(projectId);
  const isEnabled = !!project?.is_issue_type_enabled || isWorkItemTypeEnabledForProject(projectId);

  const { isLoading } = useSWR(
    workspaceSlug && projectId && isEnabled ? `PROJECT_ISSUE_TYPES_SETTINGS_${projectId}` : null,
    workspaceSlug && projectId && isEnabled ? () => fetchProjectIssueTypes(workspaceSlug, projectId) : null,
    { revalidateOnFocus: false }
  );

  if (!isEnabled) return <WorkItemTypesEnableView workspaceSlug={workspaceSlug} projectId={projectId} />;

  const TABS: { key: TTab; label: string; icon: typeof Layers }[] = [
    { key: "types", label: t("work_item_types.label"), icon: Layers },
    { key: "properties", label: t("work_item_types.settings.linked_properties.title"), icon: ListFilter },
    { key: "hierarchy", label: "Hierarchy", icon: Network },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1 border-b border-subtle">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`relative flex items-center gap-2 px-2 py-2 text-13 font-medium transition-colors ${
                active ? "text-primary" : "text-tertiary hover:text-secondary"
              }`}
            >
              <Icon className="size-4" />
              {item.label}
              {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t bg-primary" />}
            </button>
          );
        })}
      </div>

      {tab === "types" &&
        (isLoading ? (
          <Loader className="flex flex-col gap-3">
            <Loader.Item height="64px" />
            <Loader.Item height="64px" />
          </Loader>
        ) : (
          <WorkItemTypesTab workspaceSlug={workspaceSlug} projectId={projectId} />
        ))}
      {tab !== "types" && (
        <div className="py-12 text-center text-13 text-tertiary">
          {tab === "properties"
            ? "Workspace-level custom properties are coming soon."
            : "Type hierarchy configuration is coming soon."}
        </div>
      )}
    </div>
  );
});
