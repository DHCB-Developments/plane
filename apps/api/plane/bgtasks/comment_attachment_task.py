# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import timedelta

# Django imports
from django.utils import timezone

# Third party imports
from celery import shared_task

# Module imports
from plane.utils.exception_logger import log_exception


@shared_task
def purge_orphan_comment_attachments():
    """Daily: discard comment attachments that will never be seen again —
    uploads from abandoned comment drafts (never bound to a comment) and
    attachments whose comment has been deleted."""
    from plane.db.models import FileAsset, IssueComment

    try:
        now = timezone.now()
        # Unbound drafts older than a day
        FileAsset.objects.filter(
            entity_type=FileAsset.EntityTypeContext.COMMENT_ATTACHMENT,
            comment_id__isnull=True,
            created_at__lt=now - timedelta(days=1),
        ).update(is_deleted=True, deleted_at=now)

        # Attachments of comments that no longer exist (soft-deleted comments
        # don't cascade to assets)
        live_comment_ids = IssueComment.objects.values_list("id", flat=True)
        FileAsset.objects.filter(
            entity_type=FileAsset.EntityTypeContext.COMMENT_ATTACHMENT,
            comment_id__isnull=False,
            is_deleted=False,
        ).exclude(comment_id__in=live_comment_ids).update(is_deleted=True, deleted_at=now)
    except Exception as e:
        log_exception(e)
