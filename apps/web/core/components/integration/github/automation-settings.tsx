/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { MoveRight, Plus, Trash2 } from "lucide-react";
import useSWR from "swr";
// plane imports
import { StateGroupIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { CustomSelect, ToggleSwitch } from "@plane/ui";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// services
import { GithubIntegrationService } from "@/services/integrations/github-integration.service";

const githubService = new GithubIntegrationService();

type TAutomationKey = "draft_pr" | "open_pr" | "pr_approved" | "pr_merged" | "pr_closed";
type TMergeRule = { pattern: string; state: string | null };
type TReleaseCascade = { enabled: boolean; source_pattern: string; target_branch: string; state: string | null };
type TAutomation = Partial<Record<TAutomationKey, string | null>> & {
  pr_merged_rules?: TMergeRule[];
  release_cascade?: TReleaseCascade;
};

const SIMPLE_ROWS: { key: TAutomationKey; label: string }[] = [
  { key: "draft_pr", label: "Draft pull request created" },
  { key: "open_pr", label: "Pull request opened / ready for review" },
  { key: "pr_approved", label: "Pull request approved" },
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
        if (!cancelled) setAutomation((data.automation as TAutomation) ?? {});
      })
      .catch(() => {
        if (!cancelled) setAutomation({});
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId]);

  const states = getProjectStates(projectId) ?? [];

  const persist = async (patch: TAutomation) => {
    const previous = automation;
    setAutomation((current) => ({ ...current, ...patch }));
    try {
      await githubService.updateProjectSettings(workspaceSlug, projectId, {
        automation: patch as Record<string, never>,
      });
    } catch {
      setAutomation(previous);
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not update the automation settings." });
    }
  };

  const rules = automation?.pr_merged_rules ?? [];
  const cascade: TReleaseCascade = automation?.release_cascade ?? {
    enabled: false,
    source_pattern: "release/*",
    target_branch: "",
    state: null,
  };

  const StateSelect = ({
    value,
    onChange,
    allowNone = true,
    noneLabel = "No change",
  }: {
    value: string | null;
    onChange: (value: string | null) => void;
    allowNone?: boolean;
    noneLabel?: string;
  }) => {
    const selectedState = states.find((state) => state.id === value);
    return (
      <CustomSelect
        value={value}
        onChange={onChange}
        label={
          selectedState ? (
            <span className="flex items-center gap-1.5">
              <StateGroupIcon stateGroup={selectedState.group} color={selectedState.color} className="size-3.5" />
              {selectedState.name}
            </span>
          ) : (
            <span className="text-tertiary">{noneLabel}</span>
          )
        }
        disabled={automation === undefined}
      >
        {allowNone && (
          <CustomSelect.Option value={null}>
            <span className="text-tertiary">{noneLabel}</span>
          </CustomSelect.Option>
        )}
        {states.map((state) => (
          <CustomSelect.Option key={state.id} value={state.id}>
            <span className="flex items-center gap-1.5">
              <StateGroupIcon stateGroup={state.group} color={state.color} className="size-3.5" />
              {state.name}
            </span>
          </CustomSelect.Option>
        ))}
      </CustomSelect>
    );
  };

  const patternInputClassName =
    "w-36 rounded-md border border-subtle bg-surface-1 px-2 py-1 font-mono text-12 text-secondary outline-none placeholder:text-placeholder focus:border-accent-strong";

  return (
    <div className="pt-6">
      <SettingsHeading
        title="Pull request automation"
        description="When a linked pull request changes, move the work item to a state. Leave an event unset to keep the item where it is."
      />
      <div className="flex flex-col gap-2 py-4">
        {SIMPLE_ROWS.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 rounded-lg border border-subtle-1 px-4 py-2.5">
            <p className="truncate text-13 font-medium">{row.label}</p>
            <div className="flex shrink-0 items-center gap-2">
              <MoveRight className="size-3.5 text-tertiary" />
              <StateSelect
                value={automation?.[row.key] ?? null}
                onChange={(value) => void persist({ [row.key]: value } as TAutomation)}
              />
            </div>
          </div>
        ))}

        {/* Merged: branch rules + fallback */}
        <div className="rounded-lg border border-subtle-1 px-4 py-3">
          <p className="text-13 font-medium">Pull request merged</p>
          <p className="mt-0.5 text-11 text-tertiary">
            Applies to closing references (e.g. &quot;fixes&quot;) once every closing PR is merged. Rules match the
            branch the PR merged <span className="font-medium">into</span> — first match wins.
          </p>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {rules.map((rule, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <span className="text-12 text-tertiary">Into branch matching</span>
                <input
                  value={rule.pattern}
                  onChange={(e) => {
                    const next = rules.map((r, i) => (i === index ? { ...r, pattern: e.target.value } : r));
                    setAutomation((current) => ({ ...current, pr_merged_rules: next }));
                  }}
                  onBlur={() => void persist({ pr_merged_rules: rules })}
                  placeholder="release/*"
                  className={patternInputClassName}
                />
                <MoveRight className="size-3.5 text-tertiary" />
                <StateSelect
                  value={rule.state}
                  onChange={(value) =>
                    void persist({ pr_merged_rules: rules.map((r, i) => (i === index ? { ...r, state: value } : r)) })
                  }
                  allowNone={false}
                  noneLabel="Pick a state"
                />
                <Tooltip tooltipContent="Remove rule">
                  <button
                    type="button"
                    onClick={() => void persist({ pr_merged_rules: rules.filter((_, i) => i !== index) })}
                    className="grid size-6 place-items-center rounded text-tertiary hover:bg-danger-subtle hover:text-danger-secondary"
                    aria-label="Remove branch rule"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </Tooltip>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setAutomation((current) => ({
                  ...current,
                  pr_merged_rules: [...rules, { pattern: "", state: null }],
                }))
              }
              className="flex w-fit items-center gap-1.5 rounded-md border border-dashed border-strong px-2.5 py-1 text-12 font-medium text-tertiary hover:bg-layer-1 hover:text-secondary"
            >
              <Plus className="size-3.5" />
              Add branch rule
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-12 text-tertiary">{rules.length > 0 ? "Into any other branch" : "Merged into any branch"}</span>
              <MoveRight className="size-3.5 text-tertiary" />
              <StateSelect
                value={automation?.pr_merged ?? null}
                onChange={(value) => void persist({ pr_merged: value })}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-subtle-1 px-4 py-2.5">
          <p className="truncate text-13 font-medium">Pull request closed without merging</p>
          <div className="flex shrink-0 items-center gap-2">
            <MoveRight className="size-3.5 text-tertiary" />
            <StateSelect
              value={automation?.pr_closed ?? null}
              onChange={(value) => void persist({ pr_closed: value })}
            />
          </div>
        </div>
      </div>

      <SettingsHeading
        title="Release cascade"
        description="Close out a whole release with one merge: when the release branch ships, every work item staged through it completes."
      />
      <div className="flex flex-col gap-2 py-4">
        <div className="rounded-lg border border-subtle-1 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-13 font-medium">Complete staged work items when a release branch ships</p>
              <p className="mt-0.5 text-11 text-tertiary">
                Fires when a PR <span className="font-medium">from</span> a branch matching the pattern merges into the
                ship branch. Items qualify once all their closing PRs are merged.
              </p>
            </div>
            <ToggleSwitch
              value={cascade.enabled}
              onChange={() => void persist({ release_cascade: { ...cascade, enabled: !cascade.enabled } })}
            />
          </div>
          {cascade.enabled && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-subtle-1 pt-3">
              <span className="text-12 text-tertiary">Release branches matching</span>
              <input
                value={cascade.source_pattern}
                onChange={(e) =>
                  setAutomation((current) => ({
                    ...current,
                    release_cascade: { ...cascade, source_pattern: e.target.value },
                  }))
                }
                onBlur={() => void persist({ release_cascade: cascade })}
                placeholder="release/*"
                className={patternInputClassName}
              />
              <span className="text-12 text-tertiary">shipping into</span>
              <input
                value={cascade.target_branch}
                onChange={(e) =>
                  setAutomation((current) => ({
                    ...current,
                    release_cascade: { ...cascade, target_branch: e.target.value },
                  }))
                }
                onBlur={() => void persist({ release_cascade: cascade })}
                placeholder="production (blank = any)"
                className={patternInputClassName}
              />
              <span className="text-12 text-tertiary">move items to</span>
              <StateSelect
                value={cascade.state}
                onChange={(value) => void persist({ release_cascade: { ...cascade, state: value } })}
                noneLabel="Default done state"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
