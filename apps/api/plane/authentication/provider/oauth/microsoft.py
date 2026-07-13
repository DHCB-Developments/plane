# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import os
from datetime import datetime, timedelta
from urllib.parse import urlencode

import pytz
import requests

# Module imports
from plane.authentication.adapter.oauth import OauthAdapter
from plane.license.utils.instance_value import get_configuration_value
from plane.authentication.adapter.error import (
    AUTHENTICATION_ERROR_CODES,
    AuthenticationException,
)


class MicrosoftOAuthProvider(OauthAdapter):
    provider = "microsoft"
    scope = "openid email profile User.Read"

    def __init__(self, request, code=None, state=None, callback=None):
        (
            MICROSOFT_CLIENT_ID,
            MICROSOFT_CLIENT_SECRET,
        ) = get_configuration_value(
            [
                {
                    "key": "MICROSOFT_CLIENT_ID",
                    "default": os.environ.get("MICROSOFT_CLIENT_ID"),
                },
                {
                    "key": "MICROSOFT_CLIENT_SECRET",
                    "default": os.environ.get("MICROSOFT_CLIENT_SECRET"),
                },
            ]
        )

        if not (MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["MICROSOFT_NOT_CONFIGURED"],
                error_message="MICROSOFT_NOT_CONFIGURED",
            )

        # Use the "common" authority so ANY Microsoft account can sign in: work /
        # school accounts from any Entra ID tenant AND personal Microsoft accounts
        # (Outlook / Hotmail / Xbox). "common" is the only authority that accepts
        # both -- a specific tenant id restricts to one org, "organizations"
        # restricts to work/school only. This requires the Azure app registration's
        # "Supported account types" to be "any organizational directory + personal
        # Microsoft accounts" (signInAudience = AzureADandPersonalMicrosoftAccount).
        # NOTE: this intentionally overrides the god-mode "Tenant ID" field.
        tenant = "common"

        client_id = MICROSOFT_CLIENT_ID
        client_secret = MICROSOFT_CLIENT_SECRET

        # Microsoft Entra ID (Azure AD) v2.0 endpoints
        self.token_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
        # OIDC userinfo endpoint (returns sub, email, name, given_name, family_name, picture)
        self.userinfo_url = "https://graph.microsoft.com/oidc/userinfo"

        redirect_uri = f"""{"https" if request.is_secure() else "http"}://{request.get_host()}/auth/microsoft/callback/"""
        url_params = {
            "client_id": client_id,
            "scope": self.scope,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "response_mode": "query",
            "state": state,
        }
        auth_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{urlencode(url_params)}"

        super().__init__(
            request,
            self.provider,
            client_id,
            self.scope,
            redirect_uri,
            auth_url,
            self.token_url,
            self.userinfo_url,
            client_secret,
            code,
            callback=callback,
        )

    def set_token_data(self):
        data = {
            "code": self.code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
            # Microsoft's v2.0 token endpoint requires the scope on the exchange
            "scope": self.scope,
        }
        headers = {"Accept": "application/json"}
        token_response = self.get_user_token(data=data, headers=headers)
        super().set_token_data(
            {
                "access_token": token_response.get("access_token"),
                "refresh_token": token_response.get("refresh_token", None),
                "access_token_expired_at": (
                    datetime.now(tz=pytz.utc) + timedelta(seconds=token_response.get("expires_in"))
                    if token_response.get("expires_in")
                    else None
                ),
                "refresh_token_expired_at": None,
                "id_token": token_response.get("id_token", ""),
            }
        )

    def __get_graph_profile(self):
        """Fetch the full Graph profile. Needed to resolve the real email for
        guest / external (B2B) users, whose OIDC userinfo only exposes a mangled
        ``#ext#`` userPrincipalName rather than their home email address."""
        try:
            headers = {
                "Authorization": f"Bearer {self.token_data.get('access_token')}",
                "Accept": "application/json",
            }
            response = requests.get("https://graph.microsoft.com/v1.0/me", headers=headers)
            if response.ok:
                return response.json()
        except requests.RequestException:
            pass
        return {}

    @staticmethod
    def __is_real_email(email):
        # A guest UPN like "local_domain#EXT#@tenant.onmicrosoft.com" is not a usable email.
        # Azure uses "#EXT#" (uppercase), so match case-insensitively.
        return bool(email) and "@" in email and "#ext#" not in email.lower()

    @staticmethod
    def __recover_guest_email(value):
        # Azure formats a guest UPN as "local_domain#EXT#@tenant.onmicrosoft.com"
        # for the home email "local@domain". Recover it (case-insensitive marker).
        if not value:
            return None
        marker = value.lower().find("#ext#")
        if marker == -1:
            return None
        local_domain = value[:marker]
        separator = local_domain.rfind("_")
        if separator != -1:
            return f"{local_domain[:separator]}@{local_domain[separator + 1:]}"
        return None

    def __resolve_email(self, user_info_response, profile):
        # 1. A genuine, non-guest email address from any source
        candidates = [
            user_info_response.get("email"),
            profile.get("mail"),
            *(profile.get("otherMails") or []),
        ]
        for candidate in candidates:
            if self.__is_real_email(candidate):
                return candidate

        # 2. Recover the home address from a guest UPN, wherever it shows up
        for source in (
            profile.get("userPrincipalName"),
            user_info_response.get("preferred_username"),
            user_info_response.get("upn"),
            user_info_response.get("email"),
        ):
            recovered = self.__recover_guest_email(source)
            if recovered:
                return recovered

        # 3. Last resort: a plain UPN (member accounts) or the raw userinfo email
        return (
            profile.get("mail")
            or profile.get("userPrincipalName")
            or user_info_response.get("preferred_username")
            or user_info_response.get("email")
        )

    def set_user_data(self):
        user_info_response = self.get_user_response()
        profile = self.__get_graph_profile()
        email = self.__resolve_email(user_info_response, profile)

        super().set_user_data(
            {
                "email": email,
                "user": {
                    "provider_id": str(user_info_response.get("sub")),
                    "email": email,
                    "avatar": user_info_response.get("picture"),
                    "first_name": user_info_response.get("given_name"),
                    "last_name": user_info_response.get("family_name"),
                    "is_password_autoset": True,
                },
            }
        )
