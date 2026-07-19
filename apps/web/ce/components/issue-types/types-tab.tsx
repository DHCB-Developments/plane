/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Search } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/ui";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";
// local imports
import { CreateUpdateWorkItemTypeModal } from "./create-update-type-modal";
import { WorkItemTypeItem } from "./type-item";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const WorkItemTypesTab = observer(function WorkItemTypesTab(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { getProjectIssueTypes } = useIssueTypes();
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const types = getProjectIssueTypes(projectId) ?? [];
  const filtered = useMemo(
    () => types.filter((type) => type.name.toLowerCase().includes(search.toLowerCase())),
    [types, search]
  );

  return (
    <>
      <CreateUpdateWorkItemTypeModal
        isOpen={isCreateOpen}
        handleClose={() => setIsCreateOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h6 className="text-16 font-medium text-primary">{t("work_item_types.settings.types.title")}</h6>
            <span className="grid h-5 min-w-5 place-items-center rounded bg-accent-subtle px-1.5 text-11 font-medium text-accent-primary">
              {types.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2.5">
              <Search className="size-3.5 text-placeholder" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("common.search.label")}
                className="h-full w-40 bg-transparent text-13 text-secondary outline-none placeholder:text-placeholder"
              />
            </div>
            <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
              {t("work_item_types.create.button")}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {filtered.map((type) => (
            <WorkItemTypeItem key={type.id} workspaceSlug={workspaceSlug} projectId={projectId} typeId={type.id} />
          ))}
        </div>
      </div>
    </>
  );
});
