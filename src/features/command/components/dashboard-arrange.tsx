"use client";

import { useTranslations } from "next-intl";
import { Reorder, useDragControls } from "framer-motion";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { moveWidget } from "../logic";
import type { WidgetId, WidgetSetting } from "../types";

function ArrangeRow(props: {
  setting: WidgetSetting;
  title: string;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: -1 | 1) => void;
  onToggleHidden: () => void;
  onDragEnd: () => void;
}) {
  const t = useTranslations("dashboard");
  const controls = useDragControls();
  const { setting, title } = props;
  const hidden = setting.state === "hidden";

  return (
    <Reorder.Item
      value={setting}
      dragListener={false}
      dragControls={controls}
      onDragEnd={props.onDragEnd}
      className="flex items-center gap-1 rounded-xl bg-card p-2 ring-1 ring-foreground/10"
    >
      <button
        type="button"
        aria-label={t("dragHandle", { title })}
        onPointerDown={(event) => controls.start(event)}
        className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2"
      >
        <GripVertical className="size-5" aria-hidden="true" />
      </button>
      <span className={cn("min-w-0 flex-1 text-sm break-words", hidden && "text-muted-foreground line-through")}>{title}</span>
      <Button type="button" variant="ghost" className="size-10" disabled={props.isFirst} aria-label={t("moveUp", { title })} onClick={() => props.onMove(-1)}>
        <ArrowUp className="size-4" aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" className="size-10" disabled={props.isLast} aria-label={t("moveDown", { title })} onClick={() => props.onMove(1)}>
        <ArrowDown className="size-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="size-10"
        aria-pressed={hidden}
        aria-label={hidden ? t("show", { title }) : t("hide", { title })}
        onClick={props.onToggleHidden}
      >
        {hidden ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </Button>
    </Reorder.Item>
  );
}

export function DashboardArrange(props: {
  layout: WidgetSetting[];
  titles: Record<WidgetId, string>;
  onChange: (layout: WidgetSetting[]) => void;
  onSave: (layout: WidgetSetting[]) => void;
}) {
  const t = useTranslations("dashboard");
  const { layout } = props;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t("arrangeHint")}</p>
      <Reorder.Group axis="y" values={layout} onReorder={props.onChange} className="flex flex-col gap-2">
        {layout.map((setting, index) => (
          <ArrangeRow
            key={setting.id}
            setting={setting}
            title={props.titles[setting.id]}
            isFirst={index === 0}
            isLast={index === layout.length - 1}
            onMove={(direction) => props.onSave(moveWidget(layout, setting.id, direction))}
            onToggleHidden={() =>
              props.onSave(
                layout.map((other) =>
                  other.id === setting.id
                    ? { ...other, state: other.state === "hidden" ? "collapsed" : "hidden" }
                    : other
                )
              )
            }
            onDragEnd={() => props.onSave(layout)}
          />
        ))}
      </Reorder.Group>
    </div>
  );
}
