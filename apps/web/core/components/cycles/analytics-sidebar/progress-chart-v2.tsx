/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
// plane imports
import { AreaChart } from "@plane/propel/charts/area-chart";
import type { TChartData, TCycleEstimateType, TCyclePlotType } from "@plane/types";
import { renderFormattedDateWithoutYear } from "@plane/utils";

// Row shape served by /cycle-progress/ (stored daily series).
export type TCycleProgressRow = {
  date: string;
  scope: number | null;
  completed: number | null;
  pending: number | null;
  ideal: number;
  total_estimate_points: number | null;
  completed_estimate_points: number | null;
  pending_points: number | null;
  ideal_points: number;
};

type Props = {
  data: TCycleProgressRow[];
  plotType: TCyclePlotType;
  estimateType: TCycleEstimateType;
  plotTitle: string;
};

export function ProgressChartV2({ data, plotType, estimateType, plotTitle }: Props) {
  const isPoints = estimateType === "points";
  // Null values render as gaps for future days — recharts supports this even
  // though TChartData's index signature doesn't admit null.
  const chartData = data.map((row) => ({
    name: renderFormattedDateWithoutYear(row.date),
    // Burn-down tracks remaining work; burn-up tracks completed work. The
    // scope line makes mid-cycle additions visible in both modes.
    current:
      (plotType === "burnup"
        ? isPoints
          ? row.completed_estimate_points
          : row.completed
        : isPoints
          ? row.pending_points
          : row.pending) ?? null,
    ideal: isPoints ? row.ideal_points : row.ideal,
    scope: (isPoints ? row.total_estimate_points : row.scope) ?? null,
  })) as unknown as TChartData<string, string>[];

  return (
    <div className="flex w-full items-center justify-center">
      <AreaChart
        data={chartData}
        areas={[
          {
            key: "current",
            label: `${plotType === "burnup" ? "Completed" : "Remaining"} ${plotTitle}`,
            strokeColor: plotType === "burnup" ? "#26D950" : "#3F76FF",
            fill: plotType === "burnup" ? "#26D95033" : "#3F76FF33",
            fillOpacity: 1,
            showDot: true,
            smoothCurves: true,
            strokeOpacity: 1,
            stackId: "bar-one",
          },
          {
            key: "scope",
            label: "Scope",
            strokeColor: "#F59E0B",
            fill: "#F59E0B",
            fillOpacity: 0,
            showDot: false,
            smoothCurves: false,
            strokeOpacity: 1,
            stackId: "bar-two",
            style: {
              strokeWidth: 1.5,
            },
          },
          {
            key: "ideal",
            label: `Ideal ${plotTitle}`,
            strokeColor: "#A9BBD0",
            fill: "#A9BBD0",
            fillOpacity: 0,
            showDot: false,
            smoothCurves: true,
            strokeOpacity: 1,
            stackId: "bar-three",
            style: {
              strokeDasharray: "6, 3",
              strokeWidth: 1,
            },
          },
        ]}
        xAxis={{ key: "name", label: "Date" }}
        yAxis={{ key: "current", label: plotType === "burnup" ? "Completed" : "Remaining" }}
        margin={{ bottom: 30 }}
        className="h-[370px] w-full"
        legend={{
          align: "center",
          verticalAlign: "bottom",
          layout: "horizontal",
          wrapperStyles: {
            marginTop: 20,
          },
        }}
      />
    </div>
  );
}
