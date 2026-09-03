/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IIssueProperty, TIssuePropertyImpact } from "@plane/types";
import { AlertModalCore, CustomMenu } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { CreateUpdatePropertyModal } from "./create-property-modal";
import { getPropertyTypeMeta } from "./property-type-options";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const WorkItemPropertiesTab = observer(function WorkItemPropertiesTab(props: Props) {
  const { workspaceSlug, projectId } = props;
  const {
    getLibraryProperties,
    fetchLibraryProperties,
    deleteLibraryProperty,
    duplicateLibraryProperty,
    updateLibraryProperty,
    getLibraryPropertyImpact,
  } = useIssueTypes();
  // states
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ property: IIssueProperty; impact: TIssuePropertyImpact } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useSWR(
    workspaceSlug ? `ISSUE_PROPERTY_LIBRARY_${workspaceSlug}_${showArchived}` : null,
    workspaceSlug ? () => fetchLibraryProperties(workspaceSlug, showArchived) : null,
    { revalidateOnFocus: false }
  );

  const properties = getLibraryProperties(workspaceSlug);
  const filtered = useMemo(
    () => properties.filter((p) => p.display_name.toLowerCase().includes(search.toLowerCase())),
    [properties, search]
  );

  const openDelete = async (property: IIssueProperty) => {
    try {
      const impact = await getLibraryPropertyImpact(workspaceSlug, property.id);
      setDeleteTarget({ property, impact });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not check where this property is used." });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteLibraryProperty(workspaceSlug, deleteTarget.property.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Property deleted", message: `${deleteTarget.property.display_name} was removed everywhere.` });
      setDeleteTarget(null);
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Could not delete", message: (error as { error?: string })?.error ?? "Something went wrong." });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDuplicate = async (property: IIssueProperty) => {
    try {
      const copy = await duplicateLibraryProperty(workspaceSlug, property.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: `${copy.display_name} added to the library (not attached anywhere).` });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not duplicate the property." });
    }
  };

  const handleArchive = async (property: IIssueProperty, archive: boolean) => {
    try {
      await updateLibraryProperty(workspaceSlug, property.id, { is_archived: archive });
      await fetchLibraryProperties(workspaceSlug, showArchived);
      setToast({ type: TOAST_TYPE.SUCCESS, title: archive ? "Archived" : "Restored", message: property.display_name });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: (error as { error?: string })?.error ?? "Could not update the property." });
    }
  };

  return (
    <>
      <CreateUpdatePropertyModal
        isOpen={isCreateOpen || !!editId}
        handleClose={() => {
          setIsCreateOpen(false);
          setEditId(null);
        }}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        mode="library"
        propertyId={editId ?? undefined}
      />
      <AlertModalCore
        isOpen={!!deleteTarget}
        handleClose={() => setDeleteTarget(null)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        title={`Delete "${deleteTarget?.property.display_name}"?`}
        content={
          deleteTarget && (
            <div className="space-y-2">
              {deleteTarget.impact.usage.length === 0 ? (
                <p>This property isn&apos;t attached to any work item type. It will be removed from the library.</p>
              ) : (
                <>
                  <p>
                    It is attached in <span className="font-medium">{deleteTarget.impact.usage.length}</span> place
                    {deleteTarget.impact.usage.length === 1 ? "" : "s"}, with{" "}
                    <span className="font-medium">{deleteTarget.impact.total_values}</span> work item value
                    {deleteTarget.impact.total_values === 1 ? "" : "s"} in total. Deleting detaches it everywhere and
                    clears those values.
                  </p>
                  <ul className="list-disc pl-5 text-12">
                    {deleteTarget.impact.usage.map((u) => (
                      <li key={u.link_id}>
                        {u.project_identifier} · {u.issue_type_name} — {u.values} value{u.values === 1 ? "" : "s"}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {deleteTarget.impact.requires_workspace_admin && (
                <p className="text-danger-secondary">Used in projects you don&apos;t administer — a workspace admin has to do this.</p>
              )}
            </div>
          )
        }
        primaryButtonText={{ loading: "Deleting", default: "Delete everywhere" }}
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h6 className="text-16 font-medium text-primary">Property library</h6>
            <span className="grid h-5 min-w-5 place-items-center rounded bg-accent-subtle px-1.5 text-11 font-medium text-accent-primary">
              {properties.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-12 text-tertiary">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show archived
            </label>
            <div className="flex h-8 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5">
              <Search className="size-3.5 text-placeholder" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="h-full w-40 bg-transparent text-13 text-secondary outline-none placeholder:text-placeholder"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-md bg-accent-primary px-3 py-1.5 text-13 font-medium leading-4 text-on-color hover:bg-accent-primary-hover"
            >
              <Plus className="size-3.5" /> New property
            </button>
          </div>
        </div>
        <p className="text-12 text-tertiary">
          Definitions live here once and are attached to work item types per project from the Types tab. Attaching
          links — it never copies — so renaming a property renames it everywhere it&apos;s used.
        </p>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-strong py-10 text-center">
            <p className="text-13 font-medium text-secondary">No properties yet</p>
            <p className="mt-1 text-12 text-tertiary">Create one here, or add properties from a work item type.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((property) => {
              const meta = getPropertyTypeMeta(property.property_type);
              const Icon = meta?.icon;
              const usage = property.usage ?? [];
              const projects = new Set(usage.map((u) => u.project_identifier));
              const isExpanded = expandedId === property.id;
              return (
                <div key={property.id} className="rounded-md border border-subtle bg-surface-1">
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : property.id)}
                      className="grid size-5 place-items-center rounded text-tertiary hover:bg-layer-1"
                      aria-label="Show usage"
                    >
                      {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    </button>
                    {Icon && <Icon className="size-4 shrink-0 text-tertiary" />}
                    <span className="min-w-0 grow">
                      <span className="block truncate text-13 text-primary">
                        {property.display_name}
                        {property.is_archived && <span className="ml-2 text-11 text-tertiary">(archived)</span>}
                      </span>
                      {property.description && (
                        <span className="block truncate text-11 text-tertiary">{property.description}</span>
                      )}
                    </span>
                    <span className="shrink-0 rounded border border-subtle px-1.5 py-0.5 text-11 text-tertiary">
                      {usage.length === 0
                        ? "Not attached"
                        : `${usage.length} type${usage.length === 1 ? "" : "s"} · ${projects.size} project${projects.size === 1 ? "" : "s"}`}
                    </span>
                    <CustomMenu placement="bottom-end" ellipsis>
                      <CustomMenu.MenuItem onClick={() => setEditId(property.id)}>
                        <span className="flex items-center gap-2"><Pencil className="size-3.5" /> Edit</span>
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem onClick={() => void handleDuplicate(property)}>
                        <span className="flex items-center gap-2"><Copy className="size-3.5" /> Duplicate as template</span>
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem onClick={() => void handleArchive(property, !property.is_archived)}>
                        <span className="flex items-center gap-2">
                          {property.is_archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                          {property.is_archived ? "Restore" : "Archive"}
                        </span>
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem onClick={() => void openDelete(property)}>
                        <span className="flex items-center gap-2 text-danger-secondary"><Trash2 className="size-3.5" /> Delete everywhere</span>
                      </CustomMenu.MenuItem>
                    </CustomMenu>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-subtle-1 px-11 py-2 text-12 text-tertiary">
                      {usage.length === 0 ? (
                        "Not attached to any work item type yet."
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {usage.map((u) => (
                            <li key={u.link_id} className="flex items-center gap-2">
                              <span className="font-medium text-secondary">{u.project_identifier}</span>
                              <span>·</span>
                              <span>{u.issue_type_name}</span>
                              <span className="text-placeholder">— {u.values} work item{u.values === 1 ? "" : "s"} with a value</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
});
