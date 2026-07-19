/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useFormContext } from "react-hook-form";
import useSWR from "swr";
// hooks
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// plane web
import { getPropertyTypeMeta } from "@/plane-web/components/issue-types/property-type-options";
import { PropertyValueInput } from "@/plane-web/components/issues/issue-details/property-value-input";
// local imports
import type { TIssueFields } from "./issue-type-select";

export type TWorkItemModalAdditionalPropertiesProps = {
  isDraft?: boolean;
  projectId: string | null;
  workItemId: string | undefined;
  workspaceSlug: string;
};

export const WorkItemModalAdditionalProperties = observer(function WorkItemModalAdditionalProperties(
  props: TWorkItemModalAdditionalPropertiesProps
) {
  const { projectId, workspaceSlug, workItemId } = props;
  const { watch } = useFormContext<TIssueFields>();
  const typeId = watch("type_id");
  const { issuePropertyValues, setIssuePropertyValues, issuePropertyValueErrors } = useIssueModal();
  const { getPropertiesByTypeId, fetchIssueProperties, fetchIssuePropertyValues } = useIssueTypes();

  useSWR(
    typeId && projectId ? `ISSUE_TYPE_PROPERTIES_${typeId}` : null,
    typeId && projectId ? () => fetchIssueProperties(workspaceSlug, projectId, typeId) : null,
    { revalidateOnFocus: false }
  );
  const { data: existingValues } = useSWR(
    workItemId && projectId ? `ISSUE_PROPERTY_VALUES_${workItemId}` : null,
    workItemId && projectId ? () => fetchIssuePropertyValues(workspaceSlug, projectId, workItemId) : null,
    { revalidateOnFocus: false }
  );

  // Seed the modal's property values from an existing work item (edit flow).
  useEffect(() => {
    if (existingValues && Object.keys(existingValues).length > 0) {
      setIssuePropertyValues((prev) => ({ ...existingValues, ...prev }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workItemId, JSON.stringify(existingValues)]);

  const properties = typeId ? getPropertiesByTypeId(typeId).filter((property) => property.is_active) : [];
  if (!typeId || !projectId || properties.length === 0) return null;

  return (
    <div className="border-t border-subtle px-4 py-4">
      <div className="flex flex-col gap-3">
        {properties.map((property) => {
          const Icon = getPropertyTypeMeta(property.property_type)?.icon;
          const error = issuePropertyValueErrors[property.id];
          return (
            <div key={property.id} className="flex items-start gap-2">
              <div className="flex w-2/5 flex-shrink-0 items-center gap-1.5 pt-1.5 text-13 text-tertiary">
                {Icon && <Icon className="size-3.5 flex-shrink-0" />}
                <span className="truncate">{property.display_name}</span>
                {property.is_required && <span className="text-danger-secondary">*</span>}
              </div>
              <div className="w-3/5">
                <PropertyValueInput
                  property={property}
                  values={issuePropertyValues[property.id] ?? []}
                  onChange={(values) => setIssuePropertyValues((prev) => ({ ...prev, [property.id]: values }))}
                  projectId={projectId}
                />
                {error ? <span className="mt-1 block text-11 text-danger-secondary">{String(error)}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
