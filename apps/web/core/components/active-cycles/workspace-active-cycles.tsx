/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import useSWR from "swr";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Tooltip } from "@plane/propel/tooltip";
import { CycleIcon } from "@plane/propel/icons";
import { Button } from "@plane/propel/button";
import { renderFormattedDate } from "@plane/utils";
// services
import { CycleService } from "@/services/cycle.service";

const cycleService = new CycleService();

type TWorkspaceActiveCycle = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  version: number;
  project_id: string;
  project_name: string;
  project_identifier: string;
  project_logo_props: Record<string, unknown>;
  total_issues: number;
  completed_issues: number;
  started_issues: number;
  urgent_issues: number;
  high_issues: number;
};

type Props = {
  workspaceSlug: string;
};

const daysLeft = (endDate: string) => {
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.max(Math.ceil(diff / (1000 * 60 * 60 * 24)), 0);
};

export const WorkspaceActiveCyclesList = observer(function WorkspaceActiveCyclesList(props: Props) {
  const { workspaceSlug } = props;
  // states
  const [extraPages, setExtraPages] = useState<TWorkspaceActiveCycle[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const { data, isLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_ACTIVE_CYCLES_${workspaceSlug}` : null,
    workspaceSlug
      ? async () => {
          const response = await cycleService.workspaceActiveCycles(workspaceSlug, "30:0:0", 30);
          setHasMore(response.next_page_results);
          setCursor(response.next_cursor);
          setExtraPages([]);
          return response;
        }
      : null,
    { revalidateOnFocus: true }
  );

  const loadMore = async () => {
    if (!cursor) return;
    setIsLoadingMore(true);
    try {
      const response = await cycleService.workspaceActiveCycles(workspaceSlug, cursor, 30);
      setExtraPages((current) => [...current, ...(response.results as unknown as TWorkspaceActiveCycle[])]);
      setHasMore(response.next_page_results);
      setCursor(response.next_cursor);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const cycles = [...((data?.results as unknown as TWorkspaceActiveCycle[]) ?? []), ...extraPages];

  if (isLoading) {
    return <p className="py-16 text-center text-13 text-tertiary">Loading active cycles…</p>;
  }

  if (cycles.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <CycleIcon className="size-10 text-tertiary" />
        <div>
          <h3 className="text-14 font-medium">No active cycles</h3>
          <p className="mt-1 text-12 text-tertiary">
            When any project has a cycle running, it shows up here with its live progress.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-6">
      {cycles.map((cycle) => {
        const progress = cycle.total_issues > 0 ? Math.round((cycle.completed_issues / cycle.total_issues) * 100) : 0;
        const remaining = daysLeft(cycle.end_date);
        return (
          <Link
            key={cycle.id}
            to={`/${workspaceSlug}/projects/${cycle.project_id}/cycles/${cycle.id}`}
            className="flex items-center gap-4 rounded-lg border border-subtle-1 px-4 py-3 hover:bg-layer-1"
          >
            <div className="flex w-56 min-w-0 shrink-0 items-center gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded bg-layer-1">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Logo logo={cycle.project_logo_props as any} size={14} />
              </span>
              <span className="truncate text-12 font-medium text-tertiary">{cycle.project_name}</span>
            </div>
            <div className="min-w-0 grow">
              <div className="flex items-center gap-2">
                <span className="truncate text-13 font-medium">{cycle.name}</span>
                <span className="shrink-0 rounded-full bg-success-subtle px-2 py-0.5 text-10 font-medium uppercase tracking-wide text-success-primary">
                  {remaining} {remaining === 1 ? "day" : "days"} left
                </span>
              </div>
              <p className="text-11 text-tertiary">
                {renderFormattedDate(cycle.start_date)} – {renderFormattedDate(cycle.end_date)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              {(cycle.urgent_issues > 0 || cycle.high_issues > 0) && (
                <Tooltip tooltipContent="Open urgent / high priority work items">
                  <span className="text-11 font-medium text-danger-secondary">
                    {cycle.urgent_issues > 0 && `${cycle.urgent_issues} urgent`}
                    {cycle.urgent_issues > 0 && cycle.high_issues > 0 && " · "}
                    {cycle.high_issues > 0 && `${cycle.high_issues} high`}
                  </span>
                </Tooltip>
              )}
              <span className="text-11 text-tertiary">
                {cycle.started_issues} in progress
              </span>
              <div className="flex w-40 items-center gap-2">
                <div className="h-1.5 grow overflow-hidden rounded-full bg-layer-1">
                  <div className="h-full rounded-full bg-accent-primary" style={{ width: `${progress}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right text-11 font-medium tabular-nums">
                  {cycle.completed_issues}/{cycle.total_issues} · {progress}%
                </span>
              </div>
            </div>
          </Link>
        );
      })}
      {hasMore && (
        <div className="flex justify-center py-2">
          <Button variant="secondary" size="base" loading={isLoadingMore} onClick={() => void loadMore()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
});
