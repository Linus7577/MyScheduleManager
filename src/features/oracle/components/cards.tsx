"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowRight, Check, CircleCheck, Clock, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { cn } from "@/lib/utils";
import { approveProposalAction, rejectProposalAction, undoActionAction } from "../actions";
import type { BlockChange, BlockSnapshot, OracleAction, Proposal, TemplateBlockSpec, TemplateChange } from "../types";

function formatWhen(snapshot: BlockSnapshot) {
  return `${snapshot.start_time}–${snapshot.end_time} ${snapshot.title}`;
}

function BlockChangeLine({ change }: { change: BlockChange }) {
  const t = useTranslations("oracle");
  const format = useFormatter();
  return (
    <li className="flex flex-col gap-0.5 py-2 text-sm">
      <span className="text-xs text-muted-foreground">
        {format.dateTime(new Date(`${change.date}T00:00:00Z`), { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" })}
      </span>
      <span className="break-words text-muted-foreground line-through">{formatWhen(change.before)}</span>
      {change.after ? (
        <span className="flex items-start gap-1 break-words">
          <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-ember-400" aria-hidden="true" />
          {formatWhen(change.after)}
        </span>
      ) : (
        <span className="text-crimson-400">{t("willBeRemoved")}</span>
      )}
    </li>
  );
}

function TemplateChangeLine({ change }: { change: TemplateChange }) {
  const t = useTranslations("oracle");
  const weekdays = useTranslations("weekdays");
  const describe = (spec: TemplateBlockSpec) =>
    `${weekdays(String(spec.weekday))} ${spec.start_time}–${spec.end_time} ${spec.title}`;

  return (
    <li className="flex flex-col gap-0.5 py-2 text-sm">
      {change.before && <span className="break-words text-muted-foreground line-through">{describe(change.before)}</span>}
      {change.after ? (
        <span className="flex items-start gap-1 break-words">
          <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-ember-400" aria-hidden="true" />
          {describe(change.after)}
        </span>
      ) : (
        <span className="text-crimson-400">{t("willBeRemoved")}</span>
      )}
    </li>
  );
}

type EditableValues = BlockSnapshot | TemplateBlockSpec | null;

function EditProposalDialog(props: { proposal: Proposal; onClose: () => void }) {
  const t = useTranslations("oracle");
  const { pending, error, run } = useScheduleAction();
  const { proposal } = props;
  const [values, setValues] = useState<EditableValues[]>(proposal.changes.map((change) => change.after));

  function update(index: number, patch: Partial<BlockSnapshot>) {
    setValues(values.map((value, position) => (position === index && value ? { ...value, ...patch } : value)));
  }

  return (
    <FormDialog
      open
      onClose={props.onClose}
      title={t("editProposal")}
      pending={pending}
      error={error}
      onSubmit={() => run(() => approveProposalAction({ id: proposal.id, edits: values }), props.onClose)}
    >
      <p className="text-xs text-muted-foreground">{t("editHint")}</p>
      {values.map((value, index) =>
        value ? (
          <fieldset key={index} className="flex flex-col gap-3 border-t pt-3 first:border-t-0 first:pt-0">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`edit-title-${index}`}>{t("fieldTitle")}</Label>
              <Input id={`edit-title-${index}`} required maxLength={120} className="h-11" value={value.title} onChange={(e) => update(index, { title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`edit-start-${index}`}>{t("fieldStart")}</Label>
                <Input id={`edit-start-${index}`} type="time" required className="h-11" value={value.start_time} onChange={(e) => update(index, { start_time: e.target.value })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`edit-end-${index}`}>{t("fieldEnd")}</Label>
                <Input id={`edit-end-${index}`} type="time" required className="h-11" value={value.end_time} onChange={(e) => update(index, { end_time: e.target.value })} />
              </div>
            </div>
          </fieldset>
        ) : null
      )}
    </FormDialog>
  );
}

const STATUS_STYLE: Record<Exclude<Proposal["status"], "pending">, { icon: typeof Check; className: string }> = {
  approved: { icon: CircleCheck, className: "text-ember-400" },
  rejected: { icon: X, className: "text-muted-foreground" },
  expired: { icon: Clock, className: "text-muted-foreground" },
};

/** Shows exactly what would change. Nothing happens until the owner decides here. */
export function ProposalCard({ proposal }: { proposal: Proposal }) {
  const t = useTranslations("oracle");
  const { pending, error, run } = useScheduleAction();
  const [editing, setEditing] = useState(false);
  const hasEditable = proposal.changes.some((change) => change.after !== null);

  return (
    <article aria-label={t("proposalLabel")} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3 ring-1 ring-crimson-800">
      <p className="text-xs font-medium text-crimson-300">
        {proposal.kind === "block_changes" ? t("proposalBlocks") : t("proposalTemplate")}
      </p>
      <p className="text-sm font-medium break-words">{proposal.summary}</p>

      <ul className="flex flex-col divide-y">
        {proposal.kind === "block_changes"
          ? proposal.changes.map((change) => <BlockChangeLine key={change.instance_id} change={change} />)
          : proposal.changes.map((change, index) => <TemplateChangeLine key={index} change={change} />)}
      </ul>

      {proposal.status === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} className="h-11 gap-1.5 px-4" onClick={() => run(() => approveProposalAction({ id: proposal.id }))}>
            <Check className="size-4" aria-hidden="true" />
            {t("approve")}
          </Button>
          {hasEditable && (
            <Button type="button" variant="outline" disabled={pending} className="h-11 px-4" onClick={() => setEditing(true)}>
              {t("edit")}
            </Button>
          )}
          <Button type="button" variant="ghost" disabled={pending} className="h-11 px-4" onClick={() => run(() => rejectProposalAction({ id: proposal.id }))}>
            {t("reject")}
          </Button>
        </div>
      ) : (
        (() => {
          const style = STATUS_STYLE[proposal.status];
          const Icon = style.icon;
          return (
            <p className={cn("flex items-center gap-1.5 text-sm", style.className)}>
              <Icon className="size-4" aria-hidden="true" />
              {t(`status.${proposal.status}`)}
            </p>
          );
        })()
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {editing && <EditProposalDialog proposal={proposal} onClose={() => setEditing(false)} />}
    </article>
  );
}

/** Something the Oracle has already done, which can be taken back for 7 days. */
export function ActionCard(props: { action: OracleAction; now: string }) {
  const t = useTranslations("oracle");
  const { pending, error, run } = useScheduleAction();
  const { action } = props;
  const canUndo = !action.undone_at && action.undo_until > props.now;

  return (
    <article aria-label={t("actionLabel")} className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-2">
        <CircleCheck className="size-4 shrink-0 text-ember-400" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm break-words">
          <span className="text-muted-foreground">{t(`tools.${action.tool}`)}: </span>
          {action.summary}
        </p>
        {action.undone_at ? (
          <span className="text-xs text-muted-foreground">{t("undone")}</span>
        ) : (
          canUndo && (
            <Button type="button" variant="outline" disabled={pending} className="h-10 gap-1.5 px-3" onClick={() => run(() => undoActionAction({ id: action.id }))}>
              <Undo2 className="size-4" aria-hidden="true" />
              {t("undo")}
            </Button>
          )
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}
