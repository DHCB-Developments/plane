# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import date, datetime

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import CycleSchedule


def _serialize(schedule):
    return {
        "id": str(schedule.id),
        "project": str(schedule.project_id),
        "enabled": schedule.enabled,
        "title_prefix": schedule.title_prefix,
        "duration_weeks": schedule.duration_weeks,
        "cooldown_days": schedule.cooldown_days,
        "next_start_date": schedule.next_start_date.isoformat() if schedule.next_start_date else None,
        "upcoming_count": schedule.upcoming_count,
        "auto_rollover": schedule.auto_rollover,
        "next_sequence": schedule.next_sequence,
    }


class ProjectCycleScheduleEndpoint(BaseAPIView):
    """Per-project auto-schedule configuration for cycles."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def get(self, request, slug, project_id):
        schedule = CycleSchedule.objects.filter(workspace__slug=slug, project_id=project_id).first()
        if not schedule:
            return Response(None, status=status.HTTP_200_OK)
        return Response(_serialize(schedule), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        """Create or update the schedule (single row per project)."""
        title_prefix = (request.data.get("title_prefix") or "").strip()
        duration_weeks = request.data.get("duration_weeks")
        cooldown_days = request.data.get("cooldown_days", 0)
        next_start_date = request.data.get("next_start_date")
        upcoming_count = request.data.get("upcoming_count", 1)

        schedule = CycleSchedule.objects.filter(workspace__slug=slug, project_id=project_id).first()

        # Toggle-only payloads may flip these without resending the whole form.
        if set(request.data.keys()) <= {"enabled", "auto_rollover"} and schedule:
            if "enabled" in request.data:
                schedule.enabled = bool(request.data.get("enabled"))
            if "auto_rollover" in request.data:
                schedule.auto_rollover = bool(request.data.get("auto_rollover"))
            schedule.save()
            return Response(_serialize(schedule), status=status.HTTP_200_OK)

        if not title_prefix:
            return Response({"error": "Cycle title is required"}, status=status.HTTP_400_BAD_REQUEST)
        if len(title_prefix) > 255:
            return Response(
                {"error": "Title must not exceed 255 characters"}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            duration_weeks = int(duration_weeks)
            cooldown_days = int(cooldown_days)
            upcoming_count = int(upcoming_count)
        except (TypeError, ValueError):
            return Response(
                {"error": "duration_weeks, cooldown_days and upcoming_count must be numbers"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not 1 <= duration_weeks <= 30:
            return Response(
                {"error": "Cycle duration must be between 1 and 30 weeks"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if cooldown_days < 0:
            return Response(
                {"error": "Cooldown period cannot be negative"}, status=status.HTTP_400_BAD_REQUEST
            )
        if not 1 <= upcoming_count <= 3:
            return Response(
                {"error": "Number of future cycles must be between 1 and 3"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            parsed_start = datetime.strptime(str(next_start_date), "%Y-%m-%d").date()
        except (TypeError, ValueError):
            return Response({"error": "Start date is required"}, status=status.HTTP_400_BAD_REQUEST)
        if parsed_start < date.today():
            return Response(
                {"error": "Start date cannot be in the past"}, status=status.HTTP_400_BAD_REQUEST
            )

        payload = {
            "enabled": bool(request.data.get("enabled", True)),
            "title_prefix": title_prefix,
            "duration_weeks": duration_weeks,
            "cooldown_days": cooldown_days,
            "next_start_date": parsed_start,
            "upcoming_count": upcoming_count,
            "auto_rollover": bool(request.data.get("auto_rollover", False)),
        }
        if schedule:
            for field, value in payload.items():
                setattr(schedule, field, value)
            schedule.save()
        else:
            schedule = CycleSchedule.objects.create(project_id=project_id, **payload)
        return Response(_serialize(schedule), status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def delete(self, request, slug, project_id):
        schedule = CycleSchedule.objects.filter(workspace__slug=slug, project_id=project_id).first()
        if schedule:
            schedule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
