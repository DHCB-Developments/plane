/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type {
  ISearchIssueResponse,
  TIssue,
  TIssuePropertyValues,
  TIssuePropertyValueErrors,
} from "@plane/types";
// components
import { IssueModalContext } from "@/components/issues/issue-modal/context";
import type {
  TActiveAdditionalPropertiesProps,
  TCreateUpdatePropertyValuesProps,
  TPropertyValuesValidationProps,
} from "@/components/issues/issue-modal/context";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
import { useUser } from "@/hooks/store/user/user-user";

export type TIssueModalProviderProps = {
  templateId?: string;
  dataForPreload?: Partial<TIssue>;
  allowedProjectIds?: string[];
  children: React.ReactNode;
};

const isEmptyValue = (values: string[] | undefined) =>
  !values || values.length === 0 || (values.length === 1 && !values[0]);

export const IssueModalProvider = observer(function IssueModalProvider(props: TIssueModalProviderProps) {
  const { children, allowedProjectIds } = props;
  // states
  const [selectedParentIssue, setSelectedParentIssue] = useState<ISearchIssueResponse | null>(null);
  const [issuePropertyValues, setIssuePropertyValues] = useState<TIssuePropertyValues>({});
  const [issuePropertyValueErrors, setIssuePropertyValueErrors] = useState<TIssuePropertyValueErrors>({});
  // store hooks
  const { projectsWithCreatePermissions } = useUser();
  const { getPropertiesByTypeId, getProjectDefaultIssueTypeId, setIssuePropertyValues: saveValues } = useIssueTypes();
  // derived values
  const projectIdsWithCreatePermissions = Object.keys(projectsWithCreatePermissions ?? {});

  const getIssueTypeIdOnProjectChange = (projectId: string): string | null =>
    getProjectDefaultIssueTypeId(projectId) ?? null;

  const getActiveAdditionalPropertiesLength = (validationProps: TActiveAdditionalPropertiesProps): number => {
    try {
      const typeId = validationProps.watch?.("type_id");
      if (!typeId) return 0;
      return getPropertiesByTypeId(typeId).filter((property) => property.is_active).length;
    } catch {
      return 0;
    }
  };

  const handlePropertyValuesValidation = (validationProps: TPropertyValuesValidationProps): boolean => {
    try {
      const typeId = validationProps.watch?.("type_id");
      if (!typeId) return true;
      const requiredProperties = getPropertiesByTypeId(typeId).filter(
        (property) => property.is_active && property.is_required
      );
      const errors: TIssuePropertyValueErrors = {};
      let isValid = true;
      for (const property of requiredProperties) {
        if (isEmptyValue(issuePropertyValues[property.id])) {
          errors[property.id] = "This field is required";
          isValid = false;
        }
      }
      setIssuePropertyValueErrors(errors);
      return isValid;
    } catch {
      // never block work item creation on an unexpected error
      return true;
    }
  };

  const handleCreateUpdatePropertyValues = async (valueProps: TCreateUpdatePropertyValuesProps): Promise<void> => {
    const { issueId, projectId, workspaceSlug } = valueProps;
    if (!issueId || !projectId || !workspaceSlug) return;
    if (Object.keys(issuePropertyValues).length === 0) return;
    try {
      await saveValues(workspaceSlug, projectId, issueId, issuePropertyValues);
    } catch (error) {
      console.error("Failed to save work item property values", error);
    } finally {
      setIssuePropertyValues({});
      setIssuePropertyValueErrors({});
    }
  };

  return (
    <IssueModalContext.Provider
      value={{
        allowedProjectIds: allowedProjectIds ?? projectIdsWithCreatePermissions,
        workItemTemplateId: null,
        setWorkItemTemplateId: () => {},
        isApplyingTemplate: false,
        setIsApplyingTemplate: () => {},
        selectedParentIssue,
        setSelectedParentIssue,
        issuePropertyValues,
        setIssuePropertyValues,
        issuePropertyValueErrors,
        setIssuePropertyValueErrors,
        getIssueTypeIdOnProjectChange,
        getActiveAdditionalPropertiesLength,
        handlePropertyValuesValidation,
        handleCreateUpdatePropertyValues,
        handleProjectEntitiesFetch: () => Promise.resolve(),
        handleTemplateChange: () => Promise.resolve(),
        handleConvert: () => Promise.resolve(),
        handleCreateSubWorkItem: () => Promise.resolve(),
      }}
    >
      {children}
    </IssueModalContext.Provider>
  );
});
