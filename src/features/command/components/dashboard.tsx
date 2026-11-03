"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { ChevronDown, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { cn } from "@/lib/utils";
import { saveLayoutAction } from "../actions";
import type { DashboardDevice, WidgetId, WidgetSetting } from "../types";

const DESKTOP_QUERY = "(min-width: 768px)";

// Dragging needs the animation library, so it only downloads when the layout is being arranged.
const DashboardArrange = dynamic(() => import("./dashboard-arrange").then((module) => module.DashboardArrange), {
  ssr: false,
});

function subscribeToWidth(notify: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

/** Null during server rendering, because the server can't know the screen size. */
function useDevice(): DashboardDevice | null {
  return useSyncExternalStore<DashboardDevice | null>(
    subscribeToWidth,
    () => (window.matchMedia(DESKTOP_QUERY).matches ? "desktop" : "mobile"),
    () => null
  );
}

function WidgetCard(props: { id: WidgetId; title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const panelId = `widget-${props.id}`;
  return (
    <section className="rounded-xl bg-card ring-1 ring-foreground/10">
      <h2 className="font-sans">
        <button
          type="button"
          aria-expanded={props.open}
          aria-controls={panelId}
          onClick={props.onToggle}
          className="flex min-h-12 w-full items-center gap-2 rounded-xl px-4 py-2 text-left text-sm font-medium hover:bg-surface-2"
        >
          <span className="min-w-0 flex-1 break-words">{props.title}</span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", props.open && "rotate-180")} aria-hidden="true" />
        </button>
      </h2>
      {props.open && (
        <div id={panelId} className="px-4 pb-4">
          {props.children}
        </div>
      )}
    </section>
  );
}

export function Dashboard(props: {
  layouts: Record<DashboardDevice, WidgetSetting[]>;
  titles: Record<WidgetId, string>;
  widgets: Record<WidgetId, ReactNode>;
}) {
  const t = useTranslations("dashboard");
  const states = useTranslations("states");
  const device = useDevice();
  const { error, run } = useScheduleAction();
  const [layouts, setLayouts] = useState(props.layouts);
  const [arranging, setArranging] = useState(false);

  // Waiting a moment for the screen size means the wrong device's layout never flashes up.
  if (!device) {
    return (
      <p role="status" className="py-6 text-center text-sm text-muted-foreground">
        {states("loading")}
      </p>
    );
  }

  const layout = layouts[device];

  function setLayout(next: WidgetSetting[]) {
    setLayouts((current) => ({ ...current, [device as DashboardDevice]: next }));
  }

  function save(next: WidgetSetting[]) {
    setLayout(next);
    run(() => saveLayoutAction({ device, layout: next }));
  }

  function toggle(id: WidgetId) {
    save(
      layout.map((setting) =>
        setting.id === id ? { ...setting, state: setting.state === "open" ? "collapsed" : "open" } : setting
      )
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <Button
          type="button"
          variant="outline"
          aria-pressed={arranging}
          className="h-10 gap-1.5 px-3"
          onClick={() => setArranging(!arranging)}
        >
          <LayoutGrid className="size-4" aria-hidden="true" />
          {arranging ? t("doneArranging") : t("arrange")}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {arranging ? (
        <DashboardArrange layout={layout} titles={props.titles} onChange={setLayout} onSave={save} />
      ) : (
        <div className="flex flex-col gap-3">
          {layout
            .filter((setting) => setting.state !== "hidden")
            .map((setting) => (
              <WidgetCard
                key={setting.id}
                id={setting.id}
                title={props.titles[setting.id]}
                open={setting.state === "open"}
                onToggle={() => toggle(setting.id)}
              >
                {props.widgets[setting.id]}
              </WidgetCard>
            ))}
        </div>
      )}
    </div>
  );
}
