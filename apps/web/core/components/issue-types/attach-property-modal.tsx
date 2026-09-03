/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Plus, Search } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, ModalCore, EModalWidth } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { CreateUpdatePropertyModal } from "./create-property-modal";
import { getPropertyTypeMeta } from "./property-type-options";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
};

export const AttachPropertyModal = observer(function AttachPropertyModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, issueTypeId } = props;
  const { getLibraryProperties, fetchLibraryProperties, getPropertiesByTypeId, createIssueProperty } = useIssueTypes();
  // states
  const [search, setSearch] = useState("");
  const [attachingId, setAttachingId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSearch("");
    void fetchLibraryProperties(workspaceSlug).catch(() => undefined);
  }, [isOpen, workspaceSlug, fetchLibraryProperties]);

  const attachedIds = useMemo(
    () => new Set(getPropertiesByTypeId(issueTypeId).map((p) => p.id)),
    [getPropertiesByTypeId, issueTypeId]
  );
  const library = getLibraryProperties(workspaceSlug);
  const candidates = useMemo(
    () =>
      library.filter(
        (p) => !p.is_archived && !attachedIds.has(p.id) && p.display_name.toLowerCase().includes(search.toLowerCase())
      ),
    [library, attachedIds, search]
  );

  const handleAttach = async (propertyId: string) => {
    setAttachingId(propertyId);
    try {
      await createIssueProperty(workspaceSlug, projectId, issueTypeId, { property_id: propertyId });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Property attached", message: "It now applies to this type in this project." });
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Could not attach", message: (error as { error?: string })?.error ?? "Something went wrong." });
    } finally {
      setAttachingId(null);
    }
  };

  return (
    <>
      <CreateUpdatePropertyModal
        isOpen={isCreateOpen}
        handleClose={() => {
          setIsCreateOpen(false);
          handleClose();
        }}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueTypeId={issueTypeId}
        mode="type"
      />
      <ModalCore isOpen={isOpen && !isCreateOpen} handleClose={handleClose} width={EModalWidth.XXL}>
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-16 font-medium text-secondary">Attach a property</h4>
            <Button variant="neutral-primary" size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="size-3.5" /> New property
            </Button>
          </div>
          <p className="mt-1 text-12 text-tertiary">
            Pick from the workspace library. Attaching links the definition — it isn&apos;t copied — so two projects
            can share one dropdown, or each use their own property with the same name.
          </p>
          <div className="mt-3 flex h-9 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5">
            <Search className="size-3.5 text-placeholder" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the library"
              className="h-full w-full bg-transparent text-13 text-secondary outline-none placeholder:text-placeholder"
            />
          </div>
        </div>
        <div className="max-h-[50vh] min-h-32 space-y-2 overflow-y-auto px-5 pb-4">
          {candidates.length === 0 ? (
            <p className="py-8 text-center text-13 text-tertiary">
              {search ? "Nothing matches." : "Every library property is already attached — create a new one."}
            </p>
          ) : (
            candidates.map((property) => {
              const meta = getPropertyTypeMeta(property.property_type);
              const Icon = meta?.icon;
              const usage = property.usage ?? [];
              return (
                <div key={property.id} className="flex items-center gap-3 rounded-md border border-subtle p-3">
                  {Icon && <Icon className="size-4 shrink-0 text-tertiary" />}
                  <span className="flex grow flex-col overflow-hidden">
                    <span className="truncate text-13 font-medium text-primary">{property.display_name}</span>
                    <span className="truncate text-12 text-tertiary">
                      {property.description || meta?.label || property.property_type}
                      {usage.length > 0 &&
                        ` · used by ${Array.from(new Set(usage.map((u) => `${u.project_identifier} ${u.issue_type_name}`))).join(", ")}`}
                    </span>
                  </span>
                  <Button
                    variant="neutral-primary"
                    size="sm"
                    loading={attachingId === property.id}
                    onClick={() => void handleAttach(property.id)}
                  >
                    Attach
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </ModalCore>
    </>
  );
});
