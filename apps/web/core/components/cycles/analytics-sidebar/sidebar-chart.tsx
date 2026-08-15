/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TCycleEstimateType, TCyclePlotType } from "@plane/types";
import { CustomSelect, Loader } from "@plane/ui";
import { getDate } from "@plane/utils";
// components
import ProgressChart from "@/components/core/sidebar/progress-chart";
import { cycleChartOptions, validateCycleSnapshot } from "@/components/cycles/analytics-sidebar/issue-progress";
import { ProgressChartV2, type TCycleProgressRow } from "@/components/cycles/analytics-sidebar/progress-chart-v2";
import { EstimateTypeDropdown } from "@/components/cycles/dropdowns";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";

type ProgressChartProps = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};
export const SidebarChart = observer(function SidebarChart(props: ProgressChartProps) {
  const { workspaceSlug, projectId, cycleId } = props;

  // hooks
  const {
    getEstimateTypeByCycleId,
    getCycleById,
    fetchCycleDetails,
    fetchArchivedCycleDetails,
    setEstimateType,
    getPlotTypeByCycleId,
    setPlotType,
    fetchActiveCycleProgressPro,
  } = useCycle();
  const { t } = useTranslation();

  // derived data
  const cycleDetails = validateCycleSnapshot(getCycleById(cycleId));
  const cycleStartDate = getDate(cycleDetails?.start_date);
  const cycleEndDate = getDate(cycleDetails?.end_date);
  const totalEstimatePoints = cycleDetails?.total_estimate_points || 0;
  const totalIssues = cycleDetails?.total_issues || 0;
  const estimateType = getEstimateTypeByCycleId(cycleId);

  const chartDistributionData =
    estimateType === "points" ? cycleDetails?.estimate_distribution : cycleDetails?.distribution || undefined;

  const completionChartDistributionData = chartDistributionData?.completion_chart || undefined;

  // v2: stored daily series with real scope history + burn-up support.
  const isV2 = cycleDetails?.version === 2;
  const plotType: TCyclePlotType = getPlotTypeByCycleId(cycleId);
  const progressSeries = (cycleDetails as { progress?: TCycleProgressRow[] } | null)?.progress;
  useSWR(
    isV2 && workspaceSlug && projectId && cycleId ? `CYCLE_PROGRESS_V2_${cycleId}` : null,
    isV2 ? () => fetchActiveCycleProgressPro(workspaceSlug, projectId, cycleId) : null,
    { revalidateOnFocus: true }
  );

  if (!workspaceSlug || !projectId || !cycleId) return null;

  const isArchived = !!cycleDetails?.archived_at;

  // handlers
  const onChange = async (value: TCycleEstimateType) => {
    setEstimateType(cycleId, value);
    if (!workspaceSlug || !projectId || !cycleId) return;
    try {
      if (isArchived) {
        await fetchArchivedCycleDetails(workspaceSlug, projectId, cycleId);
      } else {
        await fetchCycleDetails(workspaceSlug, projectId, cycleId);
      }
    } catch (err) {
      console.error(err);
      setEstimateType(cycleId, estimateType);
    }
  };
  return (
    <div>
      <div className="relative flex items-center justify-between gap-2 pt-4">
        <EstimateTypeDropdown value={estimateType} onChange={onChange} cycleId={cycleId} projectId={projectId} />
        {isV2 && (
          <CustomSelect
            value={plotType}
            label={<span>{cycleChartOptions.find((v) => v.value === plotType)?.label ?? "Burn-down"}</span>}
            onChange={(value: TCyclePlotType) => setPlotType(cycleId, value)}
            maxHeight="lg"
            buttonClassName="bg-surface-2 border-none rounded-sm text-13 font-medium"
          >
            {cycleChartOptions.map((item) => (
              <CustomSelect.Option key={item.value} value={item.value}>
                {item.label}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        )}
      </div>
      <div className="py-4">
        <div>
          {isV2 && progressSeries && progressSeries.length > 0 ? (
            <ProgressChartV2
              data={progressSeries}
              plotType={plotType}
              estimateType={estimateType}
              plotTitle={estimateType === "points" ? t("points") : t("work_items")}
            />
          ) : cycleStartDate && cycleEndDate && completionChartDistributionData ? (
            <Fragment>
              <ProgressChart
                distribution={completionChartDistributionData}
                totalIssues={estimateType === "points" ? totalEstimatePoints : totalIssues}
                plotTitle={estimateType === "points" ? t("points") : t("work_items")}
              />
            </Fragment>
          ) : (
            <Loader className="mt-4 h-[160px] w-full">
              <Loader.Item width="100%" height="100%" />
            </Loader>
          )}
        </div>
      </div>
    </div>
  );
});
