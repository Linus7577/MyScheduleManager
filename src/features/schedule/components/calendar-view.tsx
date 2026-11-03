"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import FullCalendar, { type EventInput } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import zhTwLocale from "@fullcalendar/react/locales/zh-tw";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { wallClockInTimeZone } from "@/lib/time/today";
import type { FeedItem } from "../types";
import { EventDialog, type EventDraft } from "./event-dialog";
import { CATEGORY_COLOR, STATUS_META } from "./meta";

const MOBILE_WIDTH = 768;
const CALENDAR_HEIGHT = 640;
const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, classicThemePlugin];

function toCalendarEntry(item: FeedItem): EventInput {
  return {
    id: item.id,
    title: item.title,
    start: item.start,
    end: item.end,
    allDay: item.all_day,
    extendedProps: { item },
  };
}

/**
 * Blocks and events store the owner's local wall clock with no offset. Running the calendar in "UTC" stops it
 * shifting them to the browser's timezone, and "now" is supplied in the owner's timezone to match.
 */
export function CalendarView(props: { timeZone: string; locale: string; today: string }) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const visibleRange = useRef<{ start: string; end: string } | null>(null);
  const latestRequest = useRef(0);
  const [entries, setEntries] = useState<EventInput[]>([]);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [initialView] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < MOBILE_WIDTH ? "timeGridDay" : "dayGridMonth"
  );

  async function loadEntries() {
    if (!visibleRange.current) return;
    const { start, end } = visibleRange.current;
    // If the view changes mid-request, only the newest answer counts.
    const request = ++latestRequest.current;
    try {
      const response = await fetch(`/api/calendar?start=${start}&end=${end}`);
      if (!response.ok) throw new Error("Calendar request failed");
      const { items } = (await response.json()) as { items: FeedItem[] };
      if (request !== latestRequest.current) return;
      setLoadFailed(false);
      setEntries(items.map(toCalendarEntry));
    } catch {
      if (request === latestRequest.current) setLoadFailed(true);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button
          type="button"
          className="h-11 gap-1.5 px-3"
          onClick={() => setDraft({ event: null, date: props.today, startTime: null })}
        >
          <Plus className="size-4" aria-hidden="true" />
          {t("newEvent")}
        </Button>
      </div>

      {loadFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t("loadFailed")}
        </p>
      )}

      <div className="calendar-shell rounded-xl bg-card p-2 ring-1 ring-foreground/10 md:p-4">
        <FullCalendar
          plugins={PLUGINS}
          initialView={initialView}
          timeZone="UTC"
          now={() => wallClockInTimeZone(props.timeZone)}
          locale={props.locale === "zh-TW" ? zhTwLocale : undefined}
          firstDay={1}
          // A fixed height makes the day and week views scroll inside themselves, so they can open at scrollTime.
          height={CALENDAR_HEIGHT}
          nowIndicator
          dayMaxEvents={3}
          eventDisplay="block"
          scrollTime="07:00:00"
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          slotHeaderFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
          headerToolbar={{
            start: "prev,next today",
            center: "title",
            end: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
          }}
          buttons={{
            today: { text: t("today") },
            dayGridMonth: { text: t("month") },
            timeGridWeek: { text: t("week") },
            timeGridDay: { text: t("day") },
            listWeek: { text: t("agenda") },
          }}
          noEventsContent={t("empty")}
          events={entries}
          datesSet={(info) => {
            visibleRange.current = { start: info.startStr.slice(0, 10), end: info.endStr.slice(0, 10) };
            void loadEntries();
          }}
          eventContent={(info) => {
            const item = info.event.extendedProps.item as FeedItem;
            const meta = item.status ? STATUS_META[item.status] : null;
            const Icon = meta?.icon;
            return (
              <span className="flex min-w-0 items-center gap-1 overflow-hidden px-1 text-xs">
                <span
                  aria-hidden="true"
                  className="h-3 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLOR[item.category] }}
                />
                {Icon && <Icon className={cn("size-3 shrink-0", meta?.colorClass)} aria-hidden="true" />}
                {item.kind === "task" && <ListTodo className="size-3 shrink-0" aria-hidden="true" />}
                {info.timeText && <span className="shrink-0 tabular-nums">{info.timeText}</span>}
                <span className="truncate">{item.title}</span>
              </span>
            );
          }}
          dateClick={(info) => {
            setDraft({
              event: null,
              date: info.dateStr.slice(0, 10),
              startTime: info.allDay ? null : info.dateStr.slice(11, 16),
            });
          }}
          eventClick={(info) => {
            const item = info.event.extendedProps.item as FeedItem;
            if (item.link) router.push(item.link);
            else setDraft({ event: item.event, date: item.date, startTime: null });
          }}
        />
      </div>

      <p className="text-xs text-muted-foreground">{t("hint")}</p>

      {draft && (
        <EventDialog
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            void loadEntries();
          }}
        />
      )}
    </div>
  );
}
