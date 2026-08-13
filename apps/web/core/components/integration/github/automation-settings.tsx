/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { MoveRight } from "lucide-react";
import useSWR from "swr";
// plane imports
import { StateGroupIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomSelect } from "@plane/ui";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// services
import { GithubIntegrationService } from "@/services/integrations/github-integration.service";

const githubService = new GithubIntegrationService();

type TAutomationKey = "draft_pr" | "open_pr" | "pr_approved" | "pr_merged" | "pr_closed";
type TAutomation = Partial<Record<TAutomationKey, string | null>>;

const AUTOMATION_ROWS: { key: TAutomationKey; label: string; hint?: string }[] = [
  { key: "draft_pr", label: "Draft pull request created" },
  { key: "open_pr", label: "Pull request opened / ready for review" },
  { key: "pr_approved", label: "Pull request approved" },
  { key: "pr_merged", label: "Pull request merged", hint: "Applies to closing references (e.g. \"fixes\") once every closing PR is merged." },
  { key: "pr_closed", label: "Pull request closed without merging" },
];

type TGithubAutomationSettingsProps = {
  workspaceSlug: string;
  projectId: string;
};

export const GithubAutomationSettings = observer(function GithubAutomationSettings(
  props: TGithubAutomationSettingsProps
) {
  const { workspaceSlug, projectId } = props;
  // states
  const [automation, setAutomation] = useState<TAutomation | undefined>(undefined);
  // store hooks
  const { getProjectStates, fetchProjectStates } = useProjectState();

  useSWR(
    workspaceSlug && projectId ? `PROJECT_STATES_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchProjectStates(workspaceSlug, projectId) : null
  );

  useEffect(() => {
    let cancelled = false;
    githubService
      .getProjectSettings(workspaceSlug, projectId)
      .then((data) => {
        if (!cancelled) setAutomation(data.automation ?? {});
      })
      .catch(() => {
        if (!cancelled) setAutomation({});
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId]);

  const states = getProjectStates(projectId) ?? [];

  const handleChange = async (key: TAutomationKey, value: string | null) => {
    const previous = automation;
    setAutomation((current) => ({ ...current, [key]: value }));
    try {
      await githubService.updateProjectSettings(workspaceSlug, projectId, { automation: { [key]: value } });
    } catch {
      setAutomation(previous);
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not update the automation mapping." });
    }
  };

  return (
    <div className="pt-6">
      <SettingsHeading
        title="Pull request automation"
        description="When a linked pull request changes, move the work item to a state. Leave an event unset to keep the item where it is."
      />
      <div className="flex flex-col gap-2 py-4">
        {AUTOMATION_ROWS.map((row) => {
          const selectedId = automation?.[row.key] ?? null;
          const selectedState = states.find((state) => state.id === selectedId);
          return (
            <div key={row.key} className="flex items-center justify-between gap-3 rounded-lg border border-subtle-1 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-13 font-medium">{row.label}</p>
                {row.hint && <p className="truncate text-11 text-tertiary">{row.hint}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <MoveRight className="size-3.5 text-tertiary" />
                <CustomSelect
                  value={selectedId}
                  onChange={(value: string | null) => void handleChange(row.key, value)}
                  label={
                    selectedState ? (
                      <span className="flex items-center gap-1.5">
                        <StateGroupIcon stateGroup={selectedState.group} color={selectedState.color} className="size-3.5" />
                        {selectedState.name}
                      </span>
                    ) : (
                      <span className="text-tertiary">No change</span>
                    )
                  }
                  disabled={automation === undefined}
                >
                  <CustomSelect.Option value={null}>
                    <span className="text-tertiary">No change</span>
                  </CustomSelect.Option>
                  {states.map((state) => (
                    <CustomSelect.Option key={state.id} value={state.id}>
                      <span className="flex items-center gap-1.5">
                        <StateGroupIcon stateGroup={state.group} color={state.color} className="size-3.5" />
                        {state.name}
                      </span>
                    </CustomSelect.Option>
                  ))}
                </CustomSelect>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
