/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import type { TIssuePropertyValues } from "@plane/types";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// plane web
import { getPropertyTypeMeta } from "@/components/issue-types/property-type-options";
// local imports
import { PropertyValueInput } from "@/components/issues/property-value-input";

export type TWorkItemAdditionalSidebarProperties = {
  workItemId: string;
  workItemTypeId: string | null;
  projectId: string;
  workspaceSlug: string;
  isEditable: boolean;
  isPeekView?: boolean;
};

export const WorkItemAdditionalSidebarProperties = observer(function WorkItemAdditionalSidebarProperties(
  props: TWorkItemAdditionalSidebarProperties
) {
  const { workItemId, workItemTypeId, projectId, workspaceSlug, isEditable } = props;
  const {
    getPropertiesByTypeId,
    fetchIssueProperties,
    getIssuePropertyValues,
    fetchIssuePropertyValues,
    setIssuePropertyValues,
  } = useIssueTypes();
  const [localValues, setLocalValues] = useState<TIssuePropertyValues>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useSWR(
    workItemTypeId ? `ISSUE_TYPE_PROPERTIES_${workItemTypeId}` : null,
    workItemTypeId ? () => fetchIssueProperties(workspaceSlug, projectId, workItemTypeId) : null,
    { revalidateOnFocus: false }
  );
  useSWR(
    workItemId ? `ISSUE_PROPERTY_VALUES_${workItemId}` : null,
    workItemId ? () => fetchIssuePropertyValues(workspaceSlug, projectId, workItemId) : null,
    { revalidateOnFocus: false }
  );

  const storedValues = getIssuePropertyValues(workItemId);
  useEffect(() => {
    setLocalValues(storedValues);
  }, [JSON.stringify(storedValues)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!workItemTypeId) return null;
  const properties = getPropertiesByTypeId(workItemTypeId).filter((p) => p.is_active);
  if (properties.length === 0) return null;

  const handleChange = (propertyId: string, values: string[]) => {
    setLocalValues((prev) => ({ ...prev, [propertyId]: values }));
    clearTimeout(saveTimers.current[propertyId]);
    saveTimers.current[propertyId] = setTimeout(() => {
      setIssuePropertyValues(workspaceSlug, projectId, workItemId, { [propertyId]: values });
    }, 600);
  };

  return (
    <div className="flex flex-col gap-2.5 py-1">
      {properties.map((property) => {
        const Icon = getPropertyTypeMeta(property.property_type)?.icon;
        return (
          <div key={property.id} className="flex min-h-8 items-center gap-2">
            <div className="flex w-2/5 flex-shrink-0 items-center gap-1.5 text-13 text-tertiary">
              {Icon && <Icon className="size-3.5 flex-shrink-0" />}
              <span className="truncate">{property.display_name}</span>
              {property.is_required && <span className="text-danger-secondary">*</span>}
            </div>
            <div className="w-3/5">
              <PropertyValueInput
                property={property}
                values={localValues[property.id] ?? []}
                onChange={(values) => handleChange(property.id, values)}
                projectId={projectId}
                disabled={!isEditable}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});
