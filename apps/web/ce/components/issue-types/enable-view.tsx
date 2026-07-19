/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Layers } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button, AlertModalCore } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useIssueTypes } from "@/hooks/store/use-issue-types";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const WorkItemTypesEnableView = observer(function WorkItemTypesEnableView(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { enableIssueTypes } = useIssueTypes();
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);

  const handleEnable = async () => {
    setIsEnabling(true);
    try {
      await enableIssueTypes(workspaceSlug, projectId);
      setConfirmOpen(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Failed to enable work item types." });
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <>
      <AlertModalCore
        isOpen={isConfirmOpen}
        handleClose={() => setConfirmOpen(false)}
        handleSubmit={handleEnable}
        isSubmitting={isEnabling}
        variant="primary"
        title={t("work_item_types.empty_state.enable.confirmation.title")}
        content={t("work_item_types.empty_state.enable.confirmation.description")}
        primaryButtonText={{ loading: "Enabling", default: "Enable" }}
      />
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 py-16 text-center">
        <span className="grid size-12 place-items-center rounded-lg bg-accent-subtle text-accent-primary">
          <Layers className="size-6" />
        </span>
        <div className="flex max-w-md flex-col gap-1.5">
          <h3 className="text-16 font-semibold text-primary">
            {t("work_item_types.empty_state.enable.title")}
          </h3>
          <p className="text-13 leading-5 text-tertiary">
            {t("work_item_types.empty_state.enable.description")}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setConfirmOpen(true)}>
          {t("work_item_types.empty_state.enable.primary_button.text")}
        </Button>
      </div>
    </>
  );
});
