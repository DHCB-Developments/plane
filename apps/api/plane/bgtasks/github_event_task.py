# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from celery import shared_task

# Module imports
from plane.utils.exception_logger import log_exception


@shared_task
def process_github_event(event, delivery_id, payload):
    """Route a verified GitHub webhook event.

    M1: scaffolding — installation lifecycle only. The PR/branch linking engine
    (M3) and state automation (M5) plug in here.
    """
    try:
        action = payload.get("action", "")

        if event == "installation" and action == "deleted":
            # The app was uninstalled on GitHub's side: drop the connection so
            # the workspace shows as disconnected instead of silently broken.
            from plane.db.models import WorkspaceIntegration

            installation_id = str(payload.get("installation", {}).get("id", ""))
            WorkspaceIntegration.objects.filter(
                integration__provider="github",
                metadata__installation_id=installation_id,
            ).delete()
            return

        # pull_request / pull_request_review / check_suite / create / delete
        # are consumed by the linking engine, added in M3.
        return
    except Exception as e:
        log_exception(e)
        return
