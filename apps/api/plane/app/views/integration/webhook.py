# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import hashlib
import hmac
import json

# Third party imports
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

# Module imports
from plane.app.views.base import BaseAPIView
from plane.utils.integrations.github import get_github_app_config

# Events the integration reacts to; everything else is acknowledged and dropped.
HANDLED_EVENTS = {
    "pull_request",
    "pull_request_review",
    "check_suite",
    "create",
    "delete",
    "installation",
    "installation_repositories",
}


class GithubWebhookEndpoint(BaseAPIView):
    """Inbound GitHub App webhook. Verifies the HMAC signature, then hands the
    event to a background task so GitHub gets its 2xx within the 10s window."""

    permission_classes = [AllowAny]
    authentication_classes = []  # signature IS the authentication; also disables CSRF

    def post(self, request):
        _, _, _, webhook_secret = get_github_app_config()
        if not webhook_secret:
            return Response(
                {"error": "GitHub App is not configured"}, status=status.HTTP_400_BAD_REQUEST
            )

        signature = request.headers.get("X-Hub-Signature-256", "")
        expected = (
            "sha256="
            + hmac.new(webhook_secret.encode("utf-8"), request.body, hashlib.sha256).hexdigest()
        )
        if not hmac.compare_digest(signature, expected):
            return Response({"error": "invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        event = request.headers.get("X-GitHub-Event", "")
        delivery_id = request.headers.get("X-GitHub-Delivery", "")
        if event not in HANDLED_EVENTS:
            return Response({"message": "event ignored"}, status=status.HTTP_202_ACCEPTED)

        try:
            payload = json.loads(request.body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return Response({"error": "invalid payload"}, status=status.HTTP_400_BAD_REQUEST)

        # Imported lazily so a celery import problem can never break signature checking.
        from plane.bgtasks.github_event_task import process_github_event

        process_github_event.delay(event=event, delivery_id=delivery_id, payload=payload)
        return Response({"message": "accepted"}, status=status.HTTP_202_ACCEPTED)
