/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Github, Plus, X } from "lucide-react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { AlertModalCore } from "@plane/ui";
// hooks
import { useGithubIntegration } from "@/hooks/store/use-github-integration";
// services
import type { TGithubInstallation } from "@/services/integrations/github-integration.service";
// local imports
import { GithubCredentialsModal } from "./credentials-modal";

type TGithubConnectionCardProps = {
  workspaceSlug: string;
};

export const GithubConnectionCard = observer(function GithubConnectionCard(props: TGithubConnectionCardProps) {
  const { workspaceSlug } = props;
  // states
  const [installationToRemove, setInstallationToRemove] = useState<TGithubInstallation | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  // store hooks
  const { connectionStatus, isConnected, fetchConnectionStatus, disconnect } = useGithubIntegration();

  useSWR(
    workspaceSlug ? `GITHUB_CONNECTION_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchConnectionStatus(workspaceSlug) : null,
    { revalidateOnFocus: true }
  );

  const handleInstall = () => {
    if (!connectionStatus?.app_slug) return;
    // GitHub forwards the state param to the app's Setup URL after install.
    window.open(
      `https://github.com/apps/${connectionStatus.app_slug}/installations/new?state=${workspaceSlug}`,
      "_self"
    );
  };

  const handleRemoveInstallation = async () => {
    if (!installationToRemove) return;
    setIsRemoving(true);
    try {
      await disconnect(workspaceSlug, installationToRemove.installation_id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Organization disconnected",
        message: `${installationToRemove.account_login ?? "The organization"} is no longer connected. Also uninstall the app from the organization on GitHub.`,
      });
      setInstallationToRemove(null);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not disconnect",
        message: "Something went wrong while disconnecting. Please try again.",
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const installations = connectionStatus?.installations ?? [];

  return (
    <>
      <GithubCredentialsModal
        workspaceSlug={workspaceSlug}
        isOpen={isCredentialsModalOpen}
        handleClose={() => setIsCredentialsModalOpen(false)}
      />
      <AlertModalCore
        handleClose={() => setInstallationToRemove(null)}
        handleSubmit={() => void handleRemoveInstallation()}
        isSubmitting={isRemoving}
        isOpen={!!installationToRemove}
        title="Disconnect organization"
        content={
          <>
            Disconnect <span className="font-medium">{installationToRemove?.account_login}</span> from this
            workspace? Pull request links from its repositories stop updating, and its repositories disappear from
            project pickers.
          </>
        }
        primaryButtonText={{ loading: "Disconnecting", default: "Disconnect" }}
      />
      <div className="rounded-lg border border-subtle-1 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid size-10 flex-shrink-0 place-items-center rounded-md bg-layer-1">
              <Github className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-14 font-medium">GitHub</h4>
                {isConnected && (
                  <span className="rounded-full bg-success-subtle px-2 py-0.5 text-11 font-medium text-success-primary">
                    Connected
                  </span>
                )}
              </div>
              <p className="text-12 text-tertiary">
                {isConnected
                  ? "Add repositories to projects from each project's settings. Connect more organizations any time."
                  : connectionStatus?.is_app_configured
                    ? "Credentials saved. Install the app on your GitHub organization to finish connecting."
                    : "Register a GitHub App for your organization, then add its credentials here to enable this integration."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {connectionStatus && (
              <Button variant="ghost" size="base" onClick={() => setIsCredentialsModalOpen(true)}>
                {connectionStatus.is_app_configured ? "Edit credentials" : "Add credentials"}
              </Button>
            )}
            {!isConnected && (
              <Button
                variant="primary"
                size="base"
                disabled={!connectionStatus?.is_app_configured || !connectionStatus?.app_slug}
                onClick={handleInstall}
              >
                Connect
              </Button>
            )}
          </div>
        </div>
        {isConnected && (
          <div className="mt-3 flex flex-col gap-1.5 border-t border-subtle-1 pt-3">
            <p className="text-11 font-medium uppercase tracking-wide text-tertiary">Connected organizations</p>
            {installations.map((installation) => (
              <div
                key={installation.installation_id}
                className="flex items-center justify-between gap-2 rounded-md bg-layer-1 px-2.5 py-1.5"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {installation.account_avatar_url ? (
                    <img src={installation.account_avatar_url} alt="" className="size-4 rounded" aria-hidden="true" />
                  ) : (
                    <Github className="size-4 text-tertiary" />
                  )}
                  <span className="truncate text-12 font-medium">{installation.account_login}</span>
                  <span className="text-11 text-tertiary">{installation.account_type}</span>
                </span>
                <Tooltip tooltipContent="Disconnect organization">
                  <button
                    type="button"
                    onClick={() => setInstallationToRemove(installation)}
                    className="grid size-6 place-items-center rounded text-tertiary hover:bg-danger-subtle hover:text-danger-secondary"
                    aria-label={`Disconnect ${installation.account_login}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </Tooltip>
              </div>
            ))}
            <button
              type="button"
              onClick={handleInstall}
              className="flex items-center gap-1.5 rounded-md border border-dashed border-strong px-2.5 py-1.5 text-12 font-medium text-tertiary hover:bg-layer-1 hover:text-secondary"
            >
              <Plus className="size-3.5" />
              Connect another organization
            </button>
          </div>
        )}
      </div>
    </>
  );
});
