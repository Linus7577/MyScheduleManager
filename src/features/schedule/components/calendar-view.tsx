"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import FullCalendar, { type CalendarRef, type EventApi, type EventInput } from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import zhTwLocale from "@fullcalendar/react/locales/zh-tw";
import classicThemePlugin from "@fullcalendar/react/themes/classic";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/classic/theme.css";
import "@fullcalendar/react/themes/classic/palette.css";
import { CalendarSearch, Download, ListTodo, Plus, Repeat, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { wallClockInTimeZone } from "@/lib/time/today";
import { updateEventAction } from "../actions";
import { MAX_ICS_BYTES } from "../ics-limits";
import { movedEventFields } from "../logic";
import type { CalendarHit, CalendarImportResult } from "../service";
import type { ActionResult, FeedItem } from "../types";
import { EventDialog, type EventDraft } from "./event-dialog";
import { CATEGORY_COLOR, STATUS_META } from "./meta";

const MOBILE_WIDTH = 768;
const CALENDAR_HEIGHT = 640;
const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, classicThemePlugin];
const SEARCH_DELAY_MS = 300;

/** A repeating event is edited as a whole series in its form, so only one-off events can be dragged. */
function canDrag(item: FeedItem): boolean {
  return item.kind === "event" && !item.event?.rrule;
}

function toCalendarEntry(item: FeedItem): EventInput {
  return {
    id: item.id,
    title: item.title,
    start: item.start,
    end: item.end,
    allDay: item.all_day,
    editable: canDrag(item),
    extendedProps: { item },
  };
}

/**
 * Blocks and events store the owner's local wall clock with no offset. Running the calendar in "UTC" stops it
 * shifting them to the browser's timezone, and "now" is supplied in the owner's timezone to match.
 */
export function CalendarView(props: { timeZone: string; locale: string; today: string }) {
  const t = useTranslations("calendar");
  const errors = useTranslations("errors");
  const format = useFormatter();
  const router = useRouter();
  const calendar = useRef<CalendarRef>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSearch = useRef(0);
  const visibleRange = useRef<{ start: string; end: string } | null>(null);
  const latestRequest = useRef(0);
  const [entries, setEntries] = useState<EventInput[]>([]);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CalendarHit[] | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<{ text: string; failed: boolean } | null>(null);
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

  /** Saves a drag or resize, and puts the event back if the rules refuse it. */
  async function saveMove(info: { event: EventApi; revert: () => void }) {
    const item = info.event.extendedProps.item as FeedItem;
    if (!item.event) return info.revert();
    setMoveError(null);
    const fields = movedEventFields(item.event, info.event.startStr, info.event.endStr || null, info.event.allDay);
    let result: ActionResult;
    try {
      result = await updateEventAction({ id: item.event.id, ...fields });
    } catch {
      result = { ok: false, code: "failed" };
    }
    if (result.ok) return void loadEntries();
    info.revert();
    setMoveError(errors(result.code));
  }

  function search(text: string) {
    setQuery(text);
    setSearchFailed(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const request = ++latestSearch.current;
    if (!text.trim()) return setHits(null);
    searchTimer.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/calendar/search?q=${encodeURIComponent(text.trim())}`);
        if (!response.ok) throw new Error("Search failed");
        const { hits: found } = (await response.json()) as { hits: CalendarHit[] };
        if (request === latestSearch.current) setHits(found);
      } catch {
        if (request === latestSearch.current) setSearchFailed(true);
      }
    }, SEARCH_DELAY_MS);
  }

  function closeSearch() {
    latestSearch.current++;
    setQuery("");
    setHits(null);
    setSearchFailed(false);
  }

  async function importFile(file: File) {
    setImportNote(null);
    if (file.size > MAX_ICS_BYTES) return setImportNote({ text: errors("fileTooLarge"), failed: true });
    setImporting(true);
    try {
      const response = await fetch("/api/calendar/import", {
        method: "POST",
        headers: { "Content-Type": "text/calendar" },
        body: await file.text(),
      });
      const result = (await response.json()) as CalendarImportResult;
      if (result.ok) {
        const { added, duplicates, skipped, repeatsDropped } = result;
        setImportNote({ text: t("importDone", { added, duplicates, skipped, repeatsDropped }), failed: false });
        void loadEntries();
      } else {
        setImportNote({ text: errors(result.code), failed: true });
      }
    } catch {
      setImportNote({ text: errors("failed"), failed: true });
    } finally {
      setImporting(false);
    }
  }

  function showDay(date: string) {
    calendar.current?.getApi().changeView("timeGridDay", date);
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="calendar-search" className="text-xs text-muted-foreground">
            {t("search")}
          </Label>
          <div className="relative">
            <CalendarSearch
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="calendar-search"
              type="search"
              maxLength={80}
              className="h-11 pl-9"
              value={query}
              onChange={(e) => search(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="calendar-jump" className="text-xs text-muted-foreground">
            {t("jumpTo")}
          </Label>
          <Input
            id="calendar-jump"
            type="date"
            className="h-11"
            onChange={(e) => {
              if (e.target.value) showDay(e.target.value);
            }}
          />
        </div>
      </div>

      {(hits || searchFailed) && (
        <div className="rounded-xl bg-card p-2 ring-1 ring-foreground/10">
          <div className="flex justify-end">
            <Button type="button" variant="ghost" className="size-11" aria-label={t("searchClose")} onClick={closeSearch}>
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
          {searchFailed && (
            <p role="alert" className="px-2 pb-2 text-sm text-destructive">
              {t("searchFailed")}
            </p>
          )}
          {hits?.length === 0 && <p className="px-2 pb-2 text-sm text-muted-foreground">{t("searchNone")}</p>}
          {hits && hits.length > 0 && (
            <ul className="flex flex-col">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-surface-2"
                    onClick={() => {
                      showDay(hit.date);
                      closeSearch();
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="h-3 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLOR[hit.category] }}
                    />
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {format.dateTime(new Date(`${hit.date}T00:00:00Z`), {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      })}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loadFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t("loadFailed")}
        </p>
      )}
      {moveError && (
        <p role="alert" className="text-sm text-destructive">
          {moveError}
        </p>
      )}

      <div className="calendar-shell rounded-xl bg-card p-2 ring-1 ring-foreground/10 md:p-4">
        <FullCalendar
          ref={calendar}
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
          eventDrop={(info) => void saveMove(info)}
          eventResize={(info) => void saveMove(info)}
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
                {item.event?.rrule && <Repeat className="size-3 shrink-0" aria-hidden="true" />}
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

      <div className="flex flex-wrap items-center gap-2">
        <label
          className={cn(
            "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm ring-1 ring-foreground/15 hover:bg-surface-2 focus-within:ring-2 focus-within:ring-ring",
            importing && "pointer-events-none opacity-50"
          )}
        >
          <Upload className="size-4" aria-hidden="true" />
          {importing ? t("importing") : t("importFile")}
          <input
            type="file"
            accept=".ics,text/calendar"
            className="sr-only"
            disabled={importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importFile(file);
            }}
          />
        </label>
        <a
          href="/api/calendar/export"
          download
          className="inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 ring-foreground/15 hover:bg-surface-2"
        >
          <Download className="size-4" aria-hidden="true" />
          {t("exportFile")}
        </a>
      </div>
      <p className="text-xs text-muted-foreground">{t("fileHint")}</p>
      {importNote && (
        <p role={importNote.failed ? "alert" : "status"} className={cn("text-sm", importNote.failed && "text-destructive")}>
          {importNote.text}
        </p>
      )}

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
