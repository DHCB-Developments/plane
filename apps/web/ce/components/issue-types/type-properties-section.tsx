/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Plus } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { CreateUpdatePropertyModal } from "./create-property-modal";
import { PropertyItem } from "./property-item";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
};

export const TypePropertiesSection = observer(function TypePropertiesSection(props: Props) {
  const { workspaceSlug, projectId, issueTypeId } = props;
  const { t } = useTranslation();
  const { getPropertiesByTypeId, fetchIssueProperties, getIssueTypeById } = useIssueTypes();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useSWR(
    workspaceSlug && projectId && issueTypeId ? `ISSUE_TYPE_PROPERTIES_${issueTypeId}` : null,
    workspaceSlug && projectId && issueTypeId
      ? () => fetchIssueProperties(workspaceSlug, projectId, issueTypeId)
      : null,
    { revalidateOnFocus: false }
  );

  const properties = getPropertiesByTypeId(issueTypeId);
  const usageCount = getIssueTypeById(issueTypeId)?.usage_count ?? 0;

  return (
    <>
      <CreateUpdatePropertyModal
        isOpen={isCreateOpen}
        handleClose={() => setIsCreateOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueTypeId={issueTypeId}
      />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-13 font-medium text-secondary">
            {t("work_item_types.settings.linked_properties.title")}
          </span>
          <span className="text-12 text-tertiary">{properties.length}</span>
        </div>
        {usageCount > 1 && (
          <p className="text-11 text-tertiary">
            Shared type — property changes here apply in all {usageCount} projects using it.
          </p>
        )}
        {properties.map((property) => (
          <PropertyItem
            key={property.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueTypeId={issueTypeId}
            propertyId={property.id}
          />
        ))}
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="flex w-fit items-center gap-1.5 py-1 text-13 text-tertiary hover:text-secondary"
        >
          <Plus className="size-4" /> {t("work_item_types.settings.linked_properties.add_button")}
        </button>
      </div>
    </>
  );
});
