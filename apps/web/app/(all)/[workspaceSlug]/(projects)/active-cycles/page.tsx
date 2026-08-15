/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { WorkspaceActiveCyclesList } from "@/components/active-cycles/workspace-active-cycles";
import type { Route } from "./+types/page";

function WorkspaceActiveCyclesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { currentWorkspace } = useWorkspace();
  // derived values
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace?.name} - Active Cycles` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <WorkspaceActiveCyclesList workspaceSlug={workspaceSlug} />
    </>
  );
}

export default observer(WorkspaceActiveCyclesPage);
