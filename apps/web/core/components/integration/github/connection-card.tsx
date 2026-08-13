/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Github } from "lucide-react";
import useSWR from "swr";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
// hooks
import { useGithubIntegration } from "@/hooks/store/use-github-integration";
// local imports
import { GithubCredentialsModal } from "./credentials-modal";

type TGithubConnectionCardProps = {
  workspaceSlug: string;
};

export const GithubConnectionCard = observer(function GithubConnectionCard(props: TGithubConnectionCardProps) {
  const { workspaceSlug } = props;
  // states
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  // store hooks
  const { connectionStatus, isConnected, fetchConnectionStatus, disconnect } = useGithubIntegration();

  useSWR(
    workspaceSlug ? `GITHUB_CONNECTION_${workspaceSlug}` : null,
    workspaceSlug ? () => fetchConnectionStatus(workspaceSlug) : null,
    { revalidateOnFocus: true }
  );

  const handleConnect = () => {
    if (!connectionStatus?.app_slug) return;
    // GitHub forwards the state param to the app's Setup URL after install.
    window.open(
      `https://github.com/apps/${connectionStatus.app_slug}/installations/new?state=${workspaceSlug}`,
      "_self"
    );
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await disconnect(workspaceSlug);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "GitHub disconnected",
        message: "The workspace is no longer connected to GitHub.",
      });
      setIsDisconnectModalOpen(false);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not disconnect",
        message: "Something went wrong while disconnecting GitHub. Please try again.",
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const accountLogin = connectionStatus?.connection?.metadata?.account_login;
  const accountAvatar = connectionStatus?.connection?.metadata?.account_avatar_url;

  return (
    <>
      <GithubCredentialsModal
        workspaceSlug={workspaceSlug}
        isOpen={isCredentialsModalOpen}
        handleClose={() => setIsCredentialsModalOpen(false)}
      />
      <AlertModalCore
        handleClose={() => setIsDisconnectModalOpen(false)}
        handleSubmit={() => void handleDisconnect()}
        isSubmitting={isDisconnecting}
        isOpen={isDisconnectModalOpen}
        title="Disconnect GitHub"
        content={
          <>
            Disconnecting removes the workspace&apos;s GitHub connection. Repositories added to projects and
            existing pull request links stop updating until you connect again.
          </>
        }
        primaryButtonText={{ loading: "Disconnecting", default: "Disconnect" }}
      />
      <div className="flex items-center justify-between gap-4 rounded-lg border border-subtle-1 p-4">
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
              {isConnected ? (
                <span className="flex items-center gap-1.5">
                  {accountAvatar && (
                    <img src={accountAvatar} alt="" className="size-3.5 rounded-full" aria-hidden="true" />
                  )}
                  Connected to <span className="font-medium text-secondary">{accountLogin ?? "GitHub"}</span> — add
                  repositories to projects from each project&apos;s settings.
                </span>
              ) : connectionStatus?.is_app_configured ? (
                "Credentials saved. Install the app on your GitHub organization to finish connecting."
              ) : (
                "Register a GitHub App for your organization, then add its credentials here to enable this integration."
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connectionStatus && (
            <Button variant="ghost" size="base" onClick={() => setIsCredentialsModalOpen(true)}>
              {connectionStatus.is_app_configured ? "Edit credentials" : "Add credentials"}
            </Button>
          )}
          {isConnected ? (
            <Button variant="error-outline" size="base" onClick={() => setIsDisconnectModalOpen(true)}>
              Disconnect
            </Button>
          ) : (
            <Button
              variant="primary"
              size="base"
              disabled={!connectionStatus?.is_app_configured || !connectionStatus?.app_slug}
              onClick={handleConnect}
            >
              Connect
            </Button>
          )}
        </div>
      </div>
    </>
  );
});
