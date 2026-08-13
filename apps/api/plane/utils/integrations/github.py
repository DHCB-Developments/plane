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
from plane.license.utils.instance_value import get_configuration_value

GITHUB_API_BASE = "https://api.github.com"
INSTALLATION_TOKEN_CACHE_KEY = "github_app_installation_token_{installation_id}"


class GithubAppNotConfigured(Exception):
    """Raised when the instance has no GitHub App credentials configured."""


class GithubApiError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def get_github_app_config():
    """Return (app_id, app_slug, private_key, webhook_secret) from instance config."""
    app_id, app_slug, private_key, webhook_secret = get_configuration_value(
        [
            {"key": "GITHUB_APP_ID", "default": None},
            {"key": "GITHUB_APP_SLUG", "default": None},
            {"key": "GITHUB_APP_PRIVATE_KEY", "default": None},
            {"key": "GITHUB_APP_WEBHOOK_SECRET", "default": None},
        ]
    )
    return app_id, app_slug, private_key, webhook_secret


def is_github_app_configured():
    app_id, _, private_key, _ = get_github_app_config()
    return bool(app_id and private_key)


class GithubAppClient:
    """Minimal GitHub App REST client: app JWT -> installation token -> API calls.

    Installation tokens live for one hour on GitHub's side; they are cached for
    50 minutes so concurrent workers reuse them instead of minting new ones.
    """

    def __init__(self, installation_id):
        app_id, _, private_key, _ = get_github_app_config()
        if not (app_id and private_key):
            raise GithubAppNotConfigured("GitHub App credentials are not configured on this instance")
        self.app_id = app_id
        # The key is pasted into config/env; tolerate escaped newlines.
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
