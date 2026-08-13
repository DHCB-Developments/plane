# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import time

# Third party imports
import jwt
import requests

# Django imports
from django.core.cache import cache

# Module imports
from plane.license.utils.encryption import decrypt_data, encrypt_data

GITHUB_API_BASE = "https://api.github.com"
INSTALLATION_TOKEN_CACHE_KEY = "github_app_installation_token_{installation_id}"

# WorkspaceIntegration.config keys holding the workspace's GitHub App
# credentials. config is never serialized to the frontend; the secret values
# are additionally encrypted at rest.
CONFIG_APP_ID = "app_id"
CONFIG_APP_SLUG = "app_slug"
CONFIG_PRIVATE_KEY = "private_key"
CONFIG_WEBHOOK_SECRET = "webhook_secret"


class GithubAppNotConfigured(Exception):
    """Raised when a workspace has no usable GitHub App credentials."""


class GithubApiError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def store_workspace_github_credentials(workspace_integration, app_id, app_slug, private_key, webhook_secret):
    """Encrypt and persist the workspace's GitHub App credentials."""
    config = dict(workspace_integration.config or {})
    config[CONFIG_APP_ID] = str(app_id)
    config[CONFIG_APP_SLUG] = app_slug
    if private_key:
        config[CONFIG_PRIVATE_KEY] = encrypt_data(private_key)
    if webhook_secret:
        config[CONFIG_WEBHOOK_SECRET] = encrypt_data(webhook_secret)
    workspace_integration.config = config
    workspace_integration.save(update_fields=["config"])


def get_workspace_github_credentials(workspace_integration):
    """Return (app_id, app_slug, private_key, webhook_secret), decrypted."""
    config = workspace_integration.config or {}
    private_key = config.get(CONFIG_PRIVATE_KEY)
    webhook_secret = config.get(CONFIG_WEBHOOK_SECRET)
    return (
        config.get(CONFIG_APP_ID),
        config.get(CONFIG_APP_SLUG),
        decrypt_data(private_key) if private_key else None,
        decrypt_data(webhook_secret) if webhook_secret else None,
    )


def has_workspace_github_credentials(workspace_integration):
    config = workspace_integration.config or {}
    return bool(config.get(CONFIG_APP_ID) and config.get(CONFIG_PRIVATE_KEY))


def client_for(workspace_integration, installation_id=None):
    """Build a GithubAppClient from a workspace's stored credentials."""
    app_id, _, private_key, _ = get_workspace_github_credentials(workspace_integration)
    if not (app_id and private_key):
        raise GithubAppNotConfigured("GitHub App credentials are not configured for this workspace")
    return GithubAppClient(
        app_id,
        private_key,
        installation_id or (workspace_integration.metadata or {}).get("installation_id"),
    )


class GithubAppClient:
    """Minimal GitHub App REST client: app JWT -> installation token -> API calls.

    Installation tokens live for one hour on GitHub's side; they are cached for
    50 minutes so concurrent workers reuse them instead of minting new ones.
    """

    def __init__(self, app_id, private_key, installation_id=None):
        if not (app_id and private_key):
            raise GithubAppNotConfigured("GitHub App credentials are missing")
        self.app_id = app_id
        # The key is pasted into a form; tolerate escaped newlines.
        self.private_key = private_key.replace("\\n", "\n")
        self.installation_id = installation_id

    # ---- auth ----

    def _app_jwt(self):
        now = int(time.time())
        payload = {"iat": now - 60, "exp": now + 9 * 60, "iss": str(self.app_id)}
        return jwt.encode(payload, self.private_key, algorithm="RS256")

    def _installation_token(self):
        cache_key = INSTALLATION_TOKEN_CACHE_KEY.format(installation_id=self.installation_id)
        token = cache.get(cache_key)
        if token:
            return token
        response = requests.post(
            f"{GITHUB_API_BASE}/app/installations/{self.installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {self._app_jwt()}",
                "Accept": "application/vnd.github+json",
            },
            timeout=15,
        )
        if response.status_code != 201:
            raise GithubApiError(
                f"Could not create installation token: {response.status_code} {response.text[:200]}",
                status_code=response.status_code,
            )
        token = response.json()["token"]
        cache.set(cache_key, token, timeout=50 * 60)
        return token

    def _request(self, method, path, params=None, json=None):
        response = requests.request(
            method,
            f"{GITHUB_API_BASE}{path}",
            headers={
                "Authorization": f"token {self._installation_token()}",
                "Accept": "application/vnd.github+json",
            },
            params=params,
            json=json,
            timeout=15,
        )
        if response.status_code >= 400:
            raise GithubApiError(
                f"GitHub API {method} {path} failed: {response.status_code} {response.text[:200]}",
                status_code=response.status_code,
            )
        if response.status_code == 204:
            return None
        return response.json()

    # ---- installation ----

    def get_installation(self):
        """Installation details via the app JWT (no installation token needed)."""
        response = requests.get(
            f"{GITHUB_API_BASE}/app/installations/{self.installation_id}",
            headers={
                "Authorization": f"Bearer {self._app_jwt()}",
                "Accept": "application/vnd.github+json",
            },
            timeout=15,
        )
        if response.status_code != 200:
            raise GithubApiError(
                f"Could not fetch installation: {response.status_code} {response.text[:200]}",
                status_code=response.status_code,
            )
        return response.json()

    def list_repositories(self):
        """All repositories the installation can access."""
        repositories = []
        page = 1
        while True:
            data = self._request("GET", "/installation/repositories", params={"per_page": 100, "page": page})
            repositories.extend(data.get("repositories", []))
            if len(repositories) >= data.get("total_count", 0) or not data.get("repositories"):
                break
            page += 1
        return repositories

    # ---- pull requests ----

    def get_pull_request(self, owner, repo, number):
        return self._request("GET", f"/repos/{owner}/{repo}/pulls/{number}")

    def list_pull_requests(self, owner, repo, state="open", search=None):
        pulls = self._request("GET", f"/repos/{owner}/{repo}/pulls", params={"state": state, "per_page": 50})
        if search:
            needle = search.lower()
            pulls = [p for p in pulls if needle in p.get("title", "").lower() or needle in str(p.get("number"))]
        return pulls

    def create_issue_comment(self, owner, repo, number, body):
        """PRs share the issues comment endpoint."""
        return self._request("POST", f"/repos/{owner}/{repo}/issues/{number}/comments", json={"body": body})
