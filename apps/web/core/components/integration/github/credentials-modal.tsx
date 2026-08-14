/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Copy } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, ModalCore, EModalWidth } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
// hooks
import { useGithubIntegration } from "@/hooks/store/use-github-integration";

type TGithubCredentialsModalProps = {
  workspaceSlug: string;
  isOpen: boolean;
  handleClose: () => void;
};

export const GithubCredentialsModal = observer(function GithubCredentialsModal(props: TGithubCredentialsModalProps) {
  const { workspaceSlug, isOpen, handleClose } = props;
  // store hooks
  const { connectionStatus, saveCredentials } = useGithubIntegration();
  // states
  const [appId, setAppId] = useState("");
  const [appSlug, setAppSlug] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isUpdate = !!connectionStatus?.is_app_configured;

  useEffect(() => {
    if (!isOpen) return;
    setAppId("");
    setAppSlug(connectionStatus?.app_slug ?? "");
    setPrivateKey("");
    setWebhookSecret("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleCopy = (value: string, label: string) =>
    void copyTextToClipboard(value).then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: label }));

  const handleSubmit = async () => {
    if (!appId.trim() || !appSlug.trim() || (!isUpdate && (!privateKey.trim() || !webhookSecret.trim()))) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Missing fields", message: "Fill in every field to continue." });
      return;
    }
    setIsSubmitting(true);
    try {
      await saveCredentials(workspaceSlug, {
        app_id: appId.trim(),
        app_slug: appSlug.trim(),
        ...(privateKey.trim() ? { private_key: privateKey } : {}),
        ...(webhookSecret.trim() ? { webhook_secret: webhookSecret.trim() } : {}),
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Credentials saved",
        message: "You can now connect the workspace to GitHub.",
      });
      handleClose();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not save credentials",
        message: (error as { error?: string })?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClassName =
    "w-full rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-13 text-secondary outline-none placeholder:text-placeholder focus:border-accent-strong";

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} width={EModalWidth.XXL}>
      <div className="p-5">
        <h4 className="text-16 font-medium text-secondary">GitHub App credentials</h4>
        <p className="mt-1 text-12 text-tertiary">
          Create a GitHub App on your organization (Settings → Developer settings → GitHub Apps) and paste its
          credentials here. They are stored encrypted, per workspace. Use these values in the app registration:
        </p>
        <div className="mt-2 flex flex-col gap-1">
          {[
            { label: "Webhook URL", value: connectionStatus?.webhook_url ?? "" },
            { label: "Setup URL (enable \"Redirect on update\")", value: connectionStatus?.setup_url ?? "" },
          ].map((row) => (
            <button
              key={row.label}
              type="button"
              onClick={() => handleCopy(row.value, row.label)}
              className="flex items-center justify-between gap-2 rounded-md bg-layer-1 px-2.5 py-1.5 text-left hover:bg-layer-2"
            >
              <span className="min-w-0">
                <span className="block text-10 font-medium uppercase tracking-wide text-tertiary">{row.label}</span>
                <span className="block truncate font-mono text-12 text-secondary">{row.value}</span>
              </span>
              <Copy className="size-3.5 shrink-0 text-tertiary" />
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="gh-app-id" className="mb-1 block text-12 font-medium text-secondary">
              App ID
            </label>
            <input
              id="gh-app-id"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="e.g. 123456"
              className={inputClassName}
            />
          </div>
          <div>
            <label htmlFor="gh-app-slug" className="mb-1 block text-12 font-medium text-secondary">
              App slug
            </label>
            <input
              id="gh-app-slug"
              value={appSlug}
              onChange={(e) => setAppSlug(e.target.value)}
              placeholder="the app's URL name, e.g. dhcb-plane"
              className={inputClassName}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="gh-private-key" className="mb-1 block text-12 font-medium text-secondary">
              Private key {isUpdate && <span className="font-normal text-tertiary">(leave blank to keep current)</span>}
            </label>
            <textarea
              id="gh-private-key"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;paste the full .pem contents&#10;-----END RSA PRIVATE KEY-----"
              rows={5}
              className={`${inputClassName} resize-y font-mono text-11`}
            />
          </div>
          <div className="col-span-2">
            <label htmlFor="gh-webhook-secret" className="mb-1 block text-12 font-medium text-secondary">
              Webhook secret{" "}
              {isUpdate && <span className="font-normal text-tertiary">(leave blank to keep current)</span>}
            </label>
            <input
              id="gh-webhook-secret"
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="the secret you set on the app's webhook"
              className={inputClassName}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-subtle p-4">
        <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={() => void handleSubmit()} loading={isSubmitting}>
          {isUpdate ? "Update credentials" : "Save credentials"}
        </Button>
      </div>
    </ModalCore>
  );
});
