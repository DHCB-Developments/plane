# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import uuid

# Django imports
from django.conf import settings
from django.http import HttpResponseRedirect
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueAttachmentSerializer
from plane.app.views.base import BaseAPIView
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import FileAsset, IssueComment, Workspace
from plane.settings.storage import S3Storage
from plane.utils.path_validator import sanitize_filename


class CommentAttachmentV2Endpoint(BaseAPIView):
    """File attachments on work item comments — same presigned flow, limits and
    inline-preview safety rules as work item attachments."""

    serializer_class = IssueAttachmentSerializer
    model = FileAsset

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, issue_id, comment_id):
        name = sanitize_filename(request.data.get("name")) or "unnamed"
        type = request.data.get("type", False)
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))

        if not type or type not in settings.ATTACHMENT_MIME_TYPES:
            return Response(
                {"error": "Invalid file type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not IssueComment.objects.filter(
            pk=comment_id, issue_id=issue_id, project_id=project_id, workspace__slug=slug
        ).exists():
            return Response({"error": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)

        workspace = Workspace.objects.get(slug=slug)
        asset_key = f"{workspace.id}/{uuid.uuid4().hex}-{name}"
        size_limit = min(size, settings.FILE_SIZE_LIMIT)

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": type, "size": size_limit},
            asset=asset_key,
            size=size_limit,
            workspace_id=workspace.id,
            created_by=request.user,
            issue_id=issue_id,
            comment_id=comment_id,
            project_id=project_id,
            entity_type=FileAsset.EntityTypeContext.COMMENT_ATTACHMENT,
        )

        storage = S3Storage(request=request)
        presigned_url = storage.generate_presigned_post(object_name=asset_key, file_type=type, file_size=size_limit)

        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "attachment": IssueAttachmentSerializer(asset).data,
                "asset_url": asset.asset_url,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN], creator=True, model=FileAsset)
    def delete(self, request, slug, project_id, issue_id, comment_id, pk):
        attachment = FileAsset.objects.get(
            pk=pk, workspace__slug=slug, project_id=project_id, comment_id=comment_id
        )
        attachment.is_deleted = True
        attachment.deleted_at = timezone.now()
        attachment.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, issue_id, comment_id, pk=None):
        if pk:
            asset = FileAsset.objects.get(
                id=pk, workspace__slug=slug, project_id=project_id, comment_id=comment_id
            )
            if not asset.is_uploaded:
                return Response(
                    {"error": "The asset is not uploaded.", "status": False},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Inline disposition is opt-in and restricted to browser-renderable
            # media types; script-capable types must stay "attachment" (see the
            # work item attachment endpoint for the rationale).
            disposition = "attachment"
            if request.GET.get("disposition") == "inline":
                asset_mime_type = (asset.attributes.get("type") or "").split(";")[0].strip().lower()
                is_inline_safe_mime_type = asset_mime_type == "application/pdf" or asset_mime_type.startswith(
                    ("image/", "video/", "audio/")
                )
                if is_inline_safe_mime_type and asset_mime_type not in settings.SCRIPT_CAPABLE_MIME_TYPES:
                    disposition = "inline"

            storage = S3Storage(request=request)
            presigned_url = storage.generate_presigned_url(
                object_name=asset.asset.name,
                disposition=disposition,
                filename=asset.attributes.get("name"),
            )
            return HttpResponseRedirect(presigned_url)

        attachments = FileAsset.objects.filter(
            comment_id=comment_id,
            entity_type=FileAsset.EntityTypeContext.COMMENT_ATTACHMENT,
            workspace__slug=slug,
            project_id=project_id,
            is_uploaded=True,
        )
        serializer = IssueAttachmentSerializer(attachments, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id, issue_id, comment_id, pk):
        attachment = FileAsset.objects.get(
            pk=pk, workspace__slug=slug, project_id=project_id, comment_id=comment_id
        )
        # created_by is set at creation and never reassigned (GHSA-5mxw-g5mw-3v3w)
        if not attachment.is_uploaded:
            attachment.is_uploaded = True
        if not attachment.storage_metadata:
            get_asset_object_metadata.delay(str(attachment.id))
        attachment.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentAttachmentUnboundEndpoint(BaseAPIView):
    """Uploads made while composing a comment, before the comment exists.

    Assets are created unbound (comment_id NULL); the client binds them once
    the comment is posted. A daily task purges unbound leftovers, so discarded
    drafts clean themselves up even if the client never says goodbye.
    """

    serializer_class = IssueAttachmentSerializer
    model = FileAsset

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, issue_id):
        name = sanitize_filename(request.data.get("name")) or "unnamed"
        type = request.data.get("type", False)
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))

        if not type or type not in settings.ATTACHMENT_MIME_TYPES:
            return Response(
                {"error": "Invalid file type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        workspace = Workspace.objects.get(slug=slug)
        asset_key = f"{workspace.id}/{uuid.uuid4().hex}-{name}"
        size_limit = min(size, settings.FILE_SIZE_LIMIT)

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": type, "size": size_limit},
            asset=asset_key,
            size=size_limit,
            workspace_id=workspace.id,
            created_by=request.user,
            issue_id=issue_id,
            project_id=project_id,
            entity_type=FileAsset.EntityTypeContext.COMMENT_ATTACHMENT,
        )

        storage = S3Storage(request=request)
        presigned_url = storage.generate_presigned_post(object_name=asset_key, file_type=type, file_size=size_limit)

        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "attachment": IssueAttachmentSerializer(asset).data,
            },
            status=status.HTTP_200_OK,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id, issue_id, pk):
        attachment = FileAsset.objects.get(
            pk=pk, workspace__slug=slug, project_id=project_id, issue_id=issue_id,
            entity_type=FileAsset.EntityTypeContext.COMMENT_ATTACHMENT,
            created_by=request.user,
        )
        if not attachment.is_uploaded:
            attachment.is_uploaded = True
        if not attachment.storage_metadata:
            get_asset_object_metadata.delay(str(attachment.id))
        attachment.save()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def delete(self, request, slug, project_id, issue_id, pk):
        """Discard a pending (unbound) upload — only its uploader may."""
        attachment = FileAsset.objects.get(
            pk=pk, workspace__slug=slug, project_id=project_id, issue_id=issue_id,
            comment_id__isnull=True,
            entity_type=FileAsset.EntityTypeContext.COMMENT_ATTACHMENT,
            created_by=request.user,
        )
        attachment.is_deleted = True
        attachment.deleted_at = timezone.now()
        attachment.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentAttachmentBindEndpoint(BaseAPIView):
    """Attach pending uploads to a freshly created comment."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, issue_id, comment_id):
        asset_ids = request.data.get("asset_ids", [])
        if not isinstance(asset_ids, list) or not asset_ids:
            return Response({"error": "asset_ids is required"}, status=status.HTTP_400_BAD_REQUEST)

        comment = IssueComment.objects.filter(
            pk=comment_id, issue_id=issue_id, project_id=project_id, workspace__slug=slug
        ).first()
        if not comment:
            return Response({"error": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)

        bound = FileAsset.objects.filter(
            pk__in=asset_ids,
            workspace__slug=slug,
            project_id=project_id,
            issue_id=issue_id,
            comment_id__isnull=True,
            entity_type=FileAsset.EntityTypeContext.COMMENT_ATTACHMENT,
            created_by=request.user,  # only the uploader may bind their assets
        ).update(comment_id=comment_id)
        return Response({"bound": bound}, status=status.HTTP_200_OK)
