/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useNavigate, useSearchParams } from "react-router";
// plane imports
import { Github } from "lucide-react";
import { Button } from "@plane/propel/button";
// hooks
import { useGithubIntegration } from "@/hooks/store/use-github-integration";

/**
 * GitHub App "Setup URL" target. After a user installs the app on their org,
 * GitHub redirects here with ?installation_id=...&state=<workspaceSlug>.
 * Completes the connection and forwards to the workspace's integrations settings.
 */
function GithubSetupPage() {
  // router
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // store hooks
  const { connect } = useGithubIntegration();
  // states
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  const installationId = searchParams.get("installation_id");
  const workspaceSlug = searchParams.get("state");

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (!installationId || !workspaceSlug) {
      setError("This page is only reachable from the GitHub App installation flow.");
      return;
    }

    connect(workspaceSlug, installationId)
      .then(() => void navigate(`/${workspaceSlug}/settings/integrations/`, { replace: true }))
      .catch((err: { error?: string } | undefined) => {
        // Already-connected is a success for a re-visited callback URL.
        if (err?.error?.includes("already connected")) {
          void navigate(`/${workspaceSlug}/settings/integrations/`, { replace: true });
          return;
        }
        setError(err?.error ?? "Could not complete the GitHub connection. Please try again.");
      });
  }, [connect, installationId, navigate, workspaceSlug]);

  return (
    <div className="grid h-screen w-full place-items-center bg-canvas">
      <div className="flex flex-col items-center gap-4 text-center">
        <Github className="size-10 text-tertiary" />
        {error ? (
          <>
            <p className="text-14 text-secondary">{error}</p>
            {workspaceSlug && (
              <Button variant="secondary" size="base" onClick={() => void navigate(`/${workspaceSlug}/settings/integrations/`)}>
                Back to settings
              </Button>
            )}
          </>
        ) : (
          <p className="text-14 text-secondary">Completing the GitHub connection…</p>
        )}
      </div>
    </div>
  );
}

export default observer(GithubSetupPage);
