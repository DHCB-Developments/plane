/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { Button, ModalCore, EModalWidth, ToggleSwitch } from "@plane/ui";
import { renderFormattedPayloadDate, getDate } from "@plane/utils";
// services
import { CycleService, type TCycleSchedule } from "@/services/cycle.service";

const cycleService = new CycleService();

type TAutoScheduleSettingsProps = {
  workspaceSlug: string;
  projectId: string;
};

const inputClassName =
  "w-full rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5 text-13 text-secondary outline-none placeholder:text-placeholder focus:border-accent-strong";

export const CycleAutoScheduleSettings = observer(function CycleAutoScheduleSettings(
  props: TAutoScheduleSettingsProps
) {
  const { workspaceSlug, projectId } = props;
  // plane hooks
  const { t } = useTranslation();
  // states
  const [schedule, setSchedule] = useState<TCycleSchedule | null | undefined>(undefined);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // form fields
  const [titlePrefix, setTitlePrefix] = useState("");
  const [durationWeeks, setDurationWeeks] = useState("2");
  const [cooldownDays, setCooldownDays] = useState("0");
  const [startDate, setStartDate] = useState("");
  const [upcomingCount, setUpcomingCount] = useState("1");
  const [autoRollover, setAutoRollover] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cycleService
      .getCycleSchedule(workspaceSlug, projectId)
      .then((data) => {
        if (!cancelled) setSchedule(data);
      })
      .catch(() => {
        if (!cancelled) setSchedule(null);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId]);

  const openForm = () => {
    setTitlePrefix(schedule?.title_prefix ?? "");
    setDurationWeeks(String(schedule?.duration_weeks ?? 2));
    setCooldownDays(String(schedule?.cooldown_days ?? 0));
    setStartDate(schedule?.next_start_date ?? "");
    setUpcomingCount(String(schedule?.upcoming_count ?? 1));
    setAutoRollover(schedule?.auto_rollover ?? false);
    setIsFormOpen(true);
  };

  const handleToggle = async () => {
    if (!schedule) {
      // No configuration yet — the toggle opens the form instead.
      openForm();
      return;
    }
    try {
      const updated = await cycleService.saveCycleSchedule(workspaceSlug, projectId, {
        enabled: !schedule.enabled,
      });
      setSchedule(updated);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("project_settings.cycles.auto_schedule.toast.toggle.success.title"),
        message: t("project_settings.cycles.auto_schedule.toast.toggle.success.message"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("project_settings.cycles.auto_schedule.toast.toggle.error.title"),
        message: t("project_settings.cycles.auto_schedule.toast.toggle.error.message"),
      });
    }
  };

  const handleSave = async () => {
    if (!titlePrefix.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("project_settings.cycles.auto_schedule.form.cycle_title.validation.required") });
      return;
    }
    const duration = Number(durationWeeks);
    if (!duration || duration < 1 || duration > 30) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("project_settings.cycles.auto_schedule.form.cycle_duration.validation.max") });
      return;
    }
    const cooldown = Number(cooldownDays);
    if (Number.isNaN(cooldown) || cooldown < 0) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("project_settings.cycles.auto_schedule.form.cooldown_period.validation.negative") });
      return;
    }
    const count = Number(upcomingCount);
    if (!count || count < 1 || count > 3) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("project_settings.cycles.auto_schedule.form.number_of_cycles.validation.max") });
      return;
    }
    const parsedStart = getDate(startDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!parsedStart || parsedStart < today) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("project_settings.cycles.auto_schedule.form.start_date.validation.past") });
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await cycleService.saveCycleSchedule(workspaceSlug, projectId, {
        enabled: true,
        title_prefix: titlePrefix.trim(),
        duration_weeks: duration,
        cooldown_days: cooldown,
        next_start_date: renderFormattedPayloadDate(parsedStart) ?? startDate,
        upcoming_count: count,
        auto_rollover: autoRollover,
      });
      setSchedule(updated);
      setIsFormOpen(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("project_settings.cycles.auto_schedule.toast.save.success.title"),
        message: t("project_settings.cycles.auto_schedule.toast.save.success.message"),
      });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("project_settings.cycles.auto_schedule.toast.save.error.title"),
        message: (error as { error?: string })?.error ?? t("project_settings.cycles.auto_schedule.toast.save.error.message"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ModalCore isOpen={isFormOpen} handleClose={() => setIsFormOpen(false)} width={EModalWidth.XL}>
        <div className="p-5">
          <h4 className="text-16 font-medium text-secondary">
            {t("project_settings.cycles.auto_schedule.heading")}
          </h4>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label htmlFor="as-title" className="mb-1 block text-12 font-medium text-secondary">
                {t("project_settings.cycles.auto_schedule.form.cycle_title.label")}
              </label>
              <Tooltip tooltipContent={t("project_settings.cycles.auto_schedule.form.cycle_title.tooltip")}>
                <input
                  id="as-title"
                  value={titlePrefix}
                  onChange={(e) => setTitlePrefix(e.target.value)}
                  placeholder={t("project_settings.cycles.auto_schedule.form.cycle_title.placeholder")}
                  maxLength={255}
                  className={inputClassName}
                />
              </Tooltip>
            </div>
            <div>
              <label htmlFor="as-duration" className="mb-1 block text-12 font-medium text-secondary">
                {t("project_settings.cycles.auto_schedule.form.cycle_duration.label")} (
                {t("project_settings.cycles.auto_schedule.form.cycle_duration.unit")})
              </label>
              <input
                id="as-duration"
                type="number"
                min={1}
                max={30}
                value={durationWeeks}
                onChange={(e) => setDurationWeeks(e.target.value)}
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="as-cooldown" className="mb-1 block text-12 font-medium text-secondary">
                {t("project_settings.cycles.auto_schedule.form.cooldown_period.label")} (
                {t("project_settings.cycles.auto_schedule.form.cooldown_period.unit")})
              </label>
              <Tooltip tooltipContent={t("project_settings.cycles.auto_schedule.form.cooldown_period.tooltip")}>
                <input
                  id="as-cooldown"
                  type="number"
                  min={0}
                  value={cooldownDays}
                  onChange={(e) => setCooldownDays(e.target.value)}
                  className={inputClassName}
                />
              </Tooltip>
            </div>
            <div>
              <label htmlFor="as-start" className="mb-1 block text-12 font-medium text-secondary">
                {t("project_settings.cycles.auto_schedule.form.start_date.label")}
              </label>
              <input
                id="as-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClassName}
              />
            </div>
            <div>
              <label htmlFor="as-count" className="mb-1 block text-12 font-medium text-secondary">
                {t("project_settings.cycles.auto_schedule.form.number_of_cycles.label")}
              </label>
              <input
                id="as-count"
                type="number"
                min={1}
                max={3}
                value={upcomingCount}
                onChange={(e) => setUpcomingCount(e.target.value)}
                className={inputClassName}
              />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-md border border-subtle-1 px-3 py-2">
              <div>
                <p className="text-13 font-medium">
                  {t("project_settings.cycles.auto_schedule.form.auto_rollover.label")}
                </p>
                <p className="text-11 text-tertiary">
                  {t("project_settings.cycles.auto_schedule.form.auto_rollover.tooltip")}
                </p>
              </div>
              <ToggleSwitch value={autoRollover} onChange={() => setAutoRollover((v) => !v)} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-subtle p-4">
          <Button variant="neutral-primary" size="sm" onClick={() => setIsFormOpen(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void handleSave()} loading={isSubmitting}>
            Save
          </Button>
        </div>
      </ModalCore>

      <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-subtle-1 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-14 font-medium">{t("project_settings.cycles.auto_schedule.heading")}</h4>
            {schedule?.enabled && schedule.title_prefix && (
              <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-11 font-medium text-accent-primary">
                {schedule.title_prefix} · {schedule.duration_weeks}w
                {schedule.cooldown_days > 0 && ` +${schedule.cooldown_days}d`}
                {schedule.auto_rollover && " · rollover"}
              </span>
            )}
          </div>
          <p className="text-12 text-tertiary">{t("project_settings.cycles.auto_schedule.tooltip")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {schedule && (
            <Button variant="neutral-primary" size="sm" onClick={openForm}>
              {t("project_settings.cycles.auto_schedule.edit_button")}
            </Button>
          )}
          <ToggleSwitch value={!!schedule?.enabled} onChange={() => void handleToggle()} />
        </div>
      </div>
    </>
  );
});
