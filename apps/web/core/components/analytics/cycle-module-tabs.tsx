/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { ICycle, IModule } from "@plane/types";
// hooks
import { useProject } from "@/hooks/store/use-project";
// services
import { CycleService } from "@/services/cycle.service";
import { ModuleService } from "@/services/module.service";

const cycleService = new CycleService();
const moduleService = new ModuleService();

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-subtle-1 px-4 py-3">
    <p className="text-11 font-medium uppercase tracking-wide text-tertiary">{label}</p>
    <p className="mt-1 text-20 font-semibold tabular-nums">{value}</p>
  </div>
);

type TProjectRowShape = {
  projectId: string;
  total: number;
  active: number;
  completed: number;
  totalIssues: number;
  completedIssues: number;
};

const ProjectTable = observer(function ProjectTable({
  rows,
  activeLabel,
}: {
  rows: TProjectRowShape[];
  activeLabel: string;
}) {
  const { getProjectById } = useProject();
  return (
    <div className="overflow-x-auto rounded-lg border border-subtle-1">
      <table className="w-full min-w-[560px] text-13">
        <thead>
          <tr className="border-b border-subtle-1 bg-surface-2 text-left text-11 uppercase tracking-wide text-tertiary">
            <th className="px-4 py-2 font-medium">Project</th>
            <th className="px-4 py-2 font-medium">Total</th>
            <th className="px-4 py-2 font-medium">{activeLabel}</th>
            <th className="px-4 py-2 font-medium">Completed</th>
            <th className="px-4 py-2 font-medium">Work items done</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const project = getProjectById(row.projectId);
            const completion = row.totalIssues > 0 ? Math.round((row.completedIssues / row.totalIssues) * 100) : 0;
            return (
              <tr key={row.projectId} className="border-b border-line-soft last:border-b-0">
                <td className="flex items-center gap-2 px-4 py-2.5">
                  {project?.logo_props && <Logo logo={project.logo_props} size={14} />}
                  <span className="font-medium">{project?.name ?? "—"}</span>
                </td>
                <td className="px-4 py-2.5 tabular-nums">{row.total}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.active}</td>
                <td className="px-4 py-2.5 tabular-nums">{row.completed}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {row.completedIssues}/{row.totalIssues} ({completion}%)
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export const AnalyticsCycles = observer(function AnalyticsCycles() {
  const { workspaceSlug } = useParams();
  const { data: cycles } = useSWR(
    workspaceSlug ? `WORKSPACE_ANALYTICS_CYCLES_${workspaceSlug}` : null,
    workspaceSlug ? () => cycleService.getWorkspaceCycles(workspaceSlug.toString()) : null
  );

  if (!cycles) return <p className="py-16 text-center text-13 text-tertiary">Loading cycle analytics…</p>;

  const now = Date.now();
  const isActive = (cycle: ICycle) =>
    !!cycle.start_date &&
    !!cycle.end_date &&
    new Date(cycle.start_date).getTime() <= now &&
    new Date(cycle.end_date).getTime() >= now;
  const isCompleted = (cycle: ICycle) => !!cycle.end_date && new Date(cycle.end_date).getTime() < now;
  const isUpcoming = (cycle: ICycle) => !!cycle.start_date && new Date(cycle.start_date).getTime() > now;

  const byProject = new Map<string, TProjectRowShape>();
  for (const cycle of cycles) {
    const projectId = cycle.project_id ?? "";
    const row =
      byProject.get(projectId) ??
      ({ projectId, total: 0, active: 0, completed: 0, totalIssues: 0, completedIssues: 0 } as TProjectRowShape);
    row.total += 1;
    if (isActive(cycle)) row.active += 1;
    if (isCompleted(cycle)) row.completed += 1;
    row.totalIssues += cycle.total_issues ?? 0;
    row.completedIssues += cycle.completed_issues ?? 0;
    byProject.set(projectId, row);
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total cycles" value={cycles.length} />
        <StatCard label="Active" value={cycles.filter(isActive).length} />
        <StatCard label="Upcoming" value={cycles.filter(isUpcoming).length} />
        <StatCard label="Completed" value={cycles.filter(isCompleted).length} />
      </div>
      <ProjectTable rows={[...byProject.values()].sort((a, b) => b.total - a.total)} activeLabel="Active" />
    </div>
  );
});

export const AnalyticsModules = observer(function AnalyticsModules() {
  const { workspaceSlug } = useParams();
  const { data: modules } = useSWR(
    workspaceSlug ? `WORKSPACE_ANALYTICS_MODULES_${workspaceSlug}` : null,
    workspaceSlug ? () => moduleService.getWorkspaceModules(workspaceSlug.toString()) : null
  );

  if (!modules) return <p className="py-16 text-center text-13 text-tertiary">Loading module analytics…</p>;

  const isActive = (module: IModule) => module.status === "in-progress";
  const isCompleted = (module: IModule) => module.status === "completed";

  const byProject = new Map<string, TProjectRowShape>();
  for (const module of modules) {
    const projectId = module.project_id ?? "";
    const row =
      byProject.get(projectId) ??
      ({ projectId, total: 0, active: 0, completed: 0, totalIssues: 0, completedIssues: 0 } as TProjectRowShape);
    row.total += 1;
    if (isActive(module)) row.active += 1;
    if (isCompleted(module)) row.completed += 1;
    row.totalIssues += module.total_issues ?? 0;
    row.completedIssues += module.completed_issues ?? 0;
    byProject.set(projectId, row);
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total modules" value={modules.length} />
        <StatCard label="In progress" value={modules.filter(isActive).length} />
        <StatCard label="Planned" value={modules.filter((m) => m.status === "planned").length} />
        <StatCard label="Completed" value={modules.filter(isCompleted).length} />
      </div>
      <ProjectTable rows={[...byProject.values()].sort((a, b) => b.total - a.total)} activeLabel="In progress" />
    </div>
  );
});
