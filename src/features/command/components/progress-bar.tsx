import { cn } from "@/lib/utils";

export function ProgressBar(props: { percent: number; label: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", props.className)}>
      <div
        role="progressbar"
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={props.percent}
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <div className="h-full rounded-full bg-ember-600" style={{ width: `${props.percent}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{props.percent}%</span>
    </div>
  );
}
