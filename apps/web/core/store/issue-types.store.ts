/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { set, unset } from "lodash-es";
import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// types
import type {
  IIssueType,
  IIssueTypeAvailable,
  IIssueProperty,
  TIssueTypePayload,
  TIssuePropertyPayload,
  TIssuePropertyValues,
} from "@plane/types";
// services
import { IssueTypeService } from "@/services/issue-type/issue-type.service";
// store
import type { RootStore } from "@/store/root.store";

export interface IIssueTypesStore {
  // observables
  issueTypeMap: Record<string, IIssueType>;
  projectIssueTypeIdsMap: Record<string, string[]>;
  fetchedMap: Record<string, boolean>;
  // computed fns
  getIssueTypeById: (issueTypeId: string | null | undefined) => IIssueType | undefined;
  getProjectIssueTypeIds: (projectId: string | null | undefined) => string[] | undefined;
  getProjectIssueTypes: (projectId: string | null | undefined) => IIssueType[] | undefined;
  getProjectDefaultIssueTypeId: (projectId: string | null | undefined) => string | undefined;
  isWorkItemTypeEnabledForProject: (projectId: string | null | undefined) => boolean;
  // actions
  fetchProjectIssueTypes: (workspaceSlug: string, projectId: string) => Promise<IIssueType[]>;
  enableIssueTypes: (workspaceSlug: string, projectId: string) => Promise<IIssueType[]>;
  createIssueType: (workspaceSlug: string, projectId: string, data: TIssueTypePayload) => Promise<IIssueType>;
  updateIssueType: (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: TIssueTypePayload
  ) => Promise<IIssueType>;
  deleteIssueType: (workspaceSlug: string, projectId: string, issueTypeId: string) => Promise<void>;
  markAsDefault: (workspaceSlug: string, projectId: string, issueTypeId: string) => Promise<void>;
  fetchAvailableIssueTypes: (workspaceSlug: string, projectId: string) => Promise<IIssueTypeAvailable[]>;
  importIssueType: (workspaceSlug: string, projectId: string, issueTypeId: string) => Promise<IIssueType>;
  // properties
  issuePropertiesMap: Record<string, IIssueProperty[]>;
  getPropertiesByTypeId: (issueTypeId: string | null | undefined) => IIssueProperty[];
  fetchIssueProperties: (workspaceSlug: string, projectId: string, issueTypeId: string) => Promise<IIssueProperty[]>;
  createIssueProperty: (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: TIssuePropertyPayload
  ) => Promise<IIssueProperty>;
  updateIssueProperty: (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    propertyId: string,
    data: TIssuePropertyPayload
  ) => Promise<IIssueProperty>;
  deleteIssueProperty: (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    propertyId: string
  ) => Promise<void>;
  // property values
  issuePropertyValuesMap: Record<string, TIssuePropertyValues>;
  getIssuePropertyValues: (issueId: string | null | undefined) => TIssuePropertyValues;
  fetchIssuePropertyValues: (workspaceSlug: string, projectId: string, issueId: string) => Promise<TIssuePropertyValues>;
  setIssuePropertyValues: (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssuePropertyValues
  ) => Promise<TIssuePropertyValues>;
}

export class IssueTypesStore implements IIssueTypesStore {
  // observables
  issueTypeMap: Record<string, IIssueType> = {};
  projectIssueTypeIdsMap: Record<string, string[]> = {};
  fetchedMap: Record<string, boolean> = {};
  issuePropertiesMap: Record<string, IIssueProperty[]> = {};
  issuePropertyValuesMap: Record<string, TIssuePropertyValues> = {};
  // root store
  rootStore: RootStore;
  // services
  issueTypeService: IssueTypeService;

  constructor(_rootStore: RootStore) {
    makeObservable(this, {
      // observables
      issueTypeMap: observable,
      projectIssueTypeIdsMap: observable,
      fetchedMap: observable,
      // actions
      fetchProjectIssueTypes: action,
      enableIssueTypes: action,
      createIssueType: action,
      updateIssueType: action,
      deleteIssueType: action,
      markAsDefault: action,
      importIssueType: action,
      issuePropertiesMap: observable,
      issuePropertyValuesMap: observable,
      fetchIssueProperties: action,
      createIssueProperty: action,
      updateIssueProperty: action,
      deleteIssueProperty: action,
      fetchIssuePropertyValues: action,
      setIssuePropertyValues: action,
    });
    this.rootStore = _rootStore;
    this.issueTypeService = new IssueTypeService();
  }

  // computed fns
  getIssueTypeById = computedFn((issueTypeId: string | null | undefined) => {
    if (!issueTypeId) return undefined;
    return this.issueTypeMap[issueTypeId] ?? undefined;
  });

  getProjectIssueTypeIds = computedFn((projectId: string | null | undefined) => {
    if (!projectId) return undefined;
    return this.projectIssueTypeIdsMap[projectId] ?? undefined;
  });

  getProjectIssueTypes = computedFn((projectId: string | null | undefined) => {
    if (!projectId || !this.fetchedMap[projectId]) return undefined;
    return (this.projectIssueTypeIdsMap[projectId] ?? [])
      .map((id) => this.issueTypeMap[id])
      .filter((issueType): issueType is IIssueType => Boolean(issueType));
  });

  getProjectDefaultIssueTypeId = computedFn((projectId: string | null | undefined) => {
    if (!projectId) return undefined;
    const defaultType = (this.projectIssueTypeIdsMap[projectId] ?? [])
      .map((id) => this.issueTypeMap[id])
      .find((issueType) => issueType?.is_default);
    return defaultType?.id;
  });

  isWorkItemTypeEnabledForProject = computedFn(
    (projectId: string | null | undefined) => (this.getProjectIssueTypeIds(projectId)?.length ?? 0) > 0
  );

  // helpers
  private setIssueTypes = (projectId: string, issueTypes: IIssueType[]) => {
    runInAction(() => {
      issueTypes.forEach((issueType) => set(this.issueTypeMap, [issueType.id], issueType));
      set(
        this.projectIssueTypeIdsMap,
        [projectId],
        issueTypes.map((issueType) => issueType.id)
      );
      set(this.fetchedMap, [projectId], true);
    });
  };

  // actions
  fetchProjectIssueTypes = async (workspaceSlug: string, projectId: string) => {
    const issueTypes = await this.issueTypeService.getIssueTypes(workspaceSlug, projectId);
    this.setIssueTypes(projectId, issueTypes);
    return issueTypes;
  };

  enableIssueTypes = async (workspaceSlug: string, projectId: string) => {
    const issueTypes = await this.issueTypeService.enableIssueTypes(workspaceSlug, projectId);
    this.setIssueTypes(projectId, issueTypes);
    // Flip the project's flag so the settings view reacts immediately (no refresh).
    runInAction(() => {
      if (this.rootStore.projectRoot.project.projectMap[projectId]) {
        set(this.rootStore.projectRoot.project.projectMap, [projectId, "is_issue_type_enabled"], true);
      }
    });
    return issueTypes;
  };

  createIssueType = async (workspaceSlug: string, projectId: string, data: TIssueTypePayload) => {
    const issueType = await this.issueTypeService.createIssueType(workspaceSlug, projectId, data);
    runInAction(() => {
      set(this.issueTypeMap, [issueType.id], issueType);
      set(this.projectIssueTypeIdsMap, [projectId], [...(this.projectIssueTypeIdsMap[projectId] ?? []), issueType.id]);
    });
    return issueType;
  };

  updateIssueType = async (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: TIssueTypePayload
  ) => {
    const issueType = await this.issueTypeService.updateIssueType(workspaceSlug, projectId, issueTypeId, data);
    runInAction(() => set(this.issueTypeMap, [issueType.id], issueType));
    return issueType;
  };

  deleteIssueType = async (workspaceSlug: string, projectId: string, issueTypeId: string) => {
    await this.issueTypeService.deleteIssueType(workspaceSlug, projectId, issueTypeId);
    runInAction(() => {
      set(
        this.projectIssueTypeIdsMap,
        [projectId],
        (this.projectIssueTypeIdsMap[projectId] ?? []).filter((id) => id !== issueTypeId)
      );
      unset(this.issueTypeMap, [issueTypeId]);
    });
  };

  markAsDefault = async (workspaceSlug: string, projectId: string, issueTypeId: string) => {
    await this.issueTypeService.markDefaultIssueType(workspaceSlug, projectId, issueTypeId);
    runInAction(() => {
      (this.projectIssueTypeIdsMap[projectId] ?? []).forEach((id) => {
        const issueType = this.issueTypeMap[id];
        if (issueType) set(this.issueTypeMap, [id, "is_default"], id === issueTypeId);
      });
    });
  };


  fetchAvailableIssueTypes = async (workspaceSlug: string, projectId: string) =>
    this.issueTypeService.getAvailableIssueTypes(workspaceSlug, projectId);

  importIssueType = async (workspaceSlug: string, projectId: string, issueTypeId: string) => {
    const issueType = await this.issueTypeService.importIssueType(workspaceSlug, projectId, issueTypeId);
    runInAction(() => {
      set(this.issueTypeMap, [issueType.id], issueType);
      const existing = this.projectIssueTypeIdsMap[projectId] ?? [];
      if (!existing.includes(issueType.id)) set(this.projectIssueTypeIdsMap, [projectId], [...existing, issueType.id]);
    });
    return issueType;
  };

  // ----- custom properties -----
  getPropertiesByTypeId = computedFn((issueTypeId: string | null | undefined) => {
    if (!issueTypeId) return [];
    return this.issuePropertiesMap[issueTypeId] ?? [];
  });

  fetchIssueProperties = async (workspaceSlug: string, projectId: string, issueTypeId: string) => {
    const properties = await this.issueTypeService.getIssueProperties(workspaceSlug, projectId, issueTypeId);
    runInAction(() => set(this.issuePropertiesMap, [issueTypeId], properties));
    return properties;
  };

  createIssueProperty = async (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    data: TIssuePropertyPayload
  ) => {
    const property = await this.issueTypeService.createIssueProperty(workspaceSlug, projectId, issueTypeId, data);
    runInAction(() =>
      set(this.issuePropertiesMap, [issueTypeId], [...(this.issuePropertiesMap[issueTypeId] ?? []), property])
    );
    return property;
  };

  updateIssueProperty = async (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    propertyId: string,
    data: TIssuePropertyPayload
  ) => {
    const property = await this.issueTypeService.updateIssueProperty(
      workspaceSlug,
      projectId,
      issueTypeId,
      propertyId,
      data
    );
    runInAction(() =>
      set(
        this.issuePropertiesMap,
        [issueTypeId],
        (this.issuePropertiesMap[issueTypeId] ?? []).map((p) => (p.id === propertyId ? property : p))
      )
    );
    return property;
  };

  deleteIssueProperty = async (
    workspaceSlug: string,
    projectId: string,
    issueTypeId: string,
    propertyId: string
  ) => {
    await this.issueTypeService.deleteIssueProperty(workspaceSlug, projectId, issueTypeId, propertyId);
    runInAction(() =>
      set(
        this.issuePropertiesMap,
        [issueTypeId],
        (this.issuePropertiesMap[issueTypeId] ?? []).filter((p) => p.id !== propertyId)
      )
    );
  };

  // ----- property values -----
  getIssuePropertyValues = computedFn((issueId: string | null | undefined) => {
    if (!issueId) return {};
    return this.issuePropertyValuesMap[issueId] ?? {};
  });

  fetchIssuePropertyValues = async (workspaceSlug: string, projectId: string, issueId: string) => {
    const values = await this.issueTypeService.getIssuePropertyValues(workspaceSlug, projectId, issueId);
    runInAction(() => set(this.issuePropertyValuesMap, [issueId], values));
    return values;
  };

  setIssuePropertyValues = async (
    workspaceSlug: string,
    projectId: string,
    issueId: string,
    data: TIssuePropertyValues
  ) => {
    const values = await this.issueTypeService.setIssuePropertyValues(workspaceSlug, projectId, issueId, data);
    runInAction(() => set(this.issuePropertyValuesMap, [issueId], values));
    return values;
  };
}
