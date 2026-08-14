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
from plane.utils.integrations.github import get_workspace_github_credentials

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
    """Inbound GitHub App webhook.

    Credentials are stored per workspace, so the payload's installation id is
    used only to pick the candidate workspace — its stored webhook secret must
    then verify the HMAC signature before the event is trusted. Events that
    resolve to no configured workspace are acknowledged and dropped.
    """

    permission_classes = [AllowAny]
    authentication_classes = []  # signature IS the authentication; also disables CSRF

    def post(self, request):
        event = request.headers.get("X-GitHub-Event", "")
        delivery_id = request.headers.get("X-GitHub-Delivery", "")
        if event not in HANDLED_EVENTS:
            return Response({"message": "event ignored"}, status=status.HTTP_202_ACCEPTED)

        try:
            payload = json.loads(request.body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return Response({"error": "invalid payload"}, status=status.HTTP_400_BAD_REQUEST)

        installation_id = str((payload.get("installation") or {}).get("id") or "")
        if not installation_id:
            return Response({"message": "no installation"}, status=status.HTTP_202_ACCEPTED)

        from django.db.models import Q

        from plane.db.models import WorkspaceIntegration

        workspace_integration = (
            WorkspaceIntegration.objects.filter(
                Q(metadata__installation_id=installation_id)
                | Q(metadata__installations__contains=[{"installation_id": installation_id}]),
                integration__provider="github",
            )
            .select_related("workspace")
            .first()
        )
        if not workspace_integration:
            # Unknown installation (e.g. the pre-connect "installation created"
            # ping). Nothing to verify against — acknowledge and drop.
            return Response({"message": "unknown installation"}, status=status.HTTP_202_ACCEPTED)

        _, _, _, webhook_secret = get_workspace_github_credentials(workspace_integration)
        if not webhook_secret:
            return Response({"message": "workspace not configured"}, status=status.HTTP_202_ACCEPTED)

        signature = request.headers.get("X-Hub-Signature-256", "")
        expected = (
            "sha256="
            + hmac.new(webhook_secret.encode("utf-8"), request.body, hashlib.sha256).hexdigest()
        )
        if not hmac.compare_digest(signature, expected):
            return Response({"error": "invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        # Imported lazily so a celery import problem can never break signature checking.
        from plane.bgtasks.github_event_task import process_github_event

        process_github_event.delay(event=event, delivery_id=delivery_id, payload=payload)
        return Response({"message": "accepted"}, status=status.HTTP_202_ACCEPTED)
