"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_MESSAGE_CHARS } from "@/config/oracle.config";
import { cn } from "@/lib/utils";
import type { OracleEvent } from "../service";
import type { OracleAction, OracleMessage, Proposal } from "../types";
import { ActionCard, ProposalCard } from "./cards";

type TimelineItem =
  | { type: "message"; at: string; message: OracleMessage }
  | { type: "proposal"; at: string; proposal: Proposal }
  | { type: "action"; at: string; action: OracleAction };

function Bubble({ role, children }: { role: OracleMessage["role"]; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "max-w-[85%] rounded-xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
        role === "user" ? "self-end bg-crimson-950 text-bone-50" : "self-start bg-surface-2"
      )}
    >
      {children}
    </p>
  );
}

/** A full-screen sheet on phones and a side drawer on desktop, as a page of its own. */
export function OracleChat(props: { messages: OracleMessage[]; proposals: Proposal[]; actions: OracleAction[]; now: string }) {
  const t = useTranslations("oracle");
  const errors = useTranslations("errors");
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState<string | null>(null);

  const timeline: TimelineItem[] = [
    ...props.messages.map((message): TimelineItem => ({ type: "message", at: message.created_at, message })),
    ...props.proposals.map((proposal): TimelineItem => ({ type: "proposal", at: proposal.created_at, proposal })),
    ...props.actions.map((action): TimelineItem => ({ type: "action", at: action.created_at, action })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [props.messages.length, props.proposals.length, props.actions.length, streaming, pendingUser]);

  async function send() {
    const message = text.trim();
    if (!message || sending) return;

    setSending(true);
    setError(null);
    setText("");
    setPendingUser(message);
    setStreaming("");

    try {
      const response = await fetch("/api/oracle/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
      });
      if (!response.ok || !response.body) throw new Error("The request failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handle = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as OracleEvent;
        if (event.type === "text") setStreaming((current) => current + event.text);
        if (event.type === "card") router.refresh();
        if (event.type === "error") setError(errors(event.code));
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(handle);
      }
      handle(buffer);
    } catch {
      setError(errors("failed"));
    } finally {
      setSending(false);
      router.refresh();
    }
  }

  // Saved messages replace the live copies once the refreshed page arrives.
  const lastSaved = props.messages.at(-1)?.content;
  const showPendingUser = pendingUser && !props.messages.some((message) => message.role === "user" && message.content === pendingUser);
  const showStreaming = streaming && lastSaved !== streaming;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg md:top-0 md:right-0 md:bottom-0 md:left-auto md:w-[28rem] md:border-l">
      <header className="flex items-center gap-2 border-b px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Eye className="size-5 text-crimson-400" aria-hidden="true" />
        <h1 className="flex-1 text-lg font-semibold">{t("title")}</h1>
        <Link href="/" aria-label={t("close")} className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-2">
          <X className="size-5" aria-hidden="true" />
        </Link>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {timeline.length === 0 && !pendingUser && <p className="m-auto max-w-xs text-center text-sm text-muted-foreground">{t("empty")}</p>}

        {timeline.map((item) => {
          if (item.type === "message") {
            return (
              <Bubble key={item.message.id} role={item.message.role}>
                {item.message.content}
              </Bubble>
            );
          }
          if (item.type === "proposal") return <ProposalCard key={item.proposal.id} proposal={item.proposal} />;
          return <ActionCard key={item.action.id} action={item.action} now={props.now} />;
        })}

        {showPendingUser && <Bubble role="user">{pendingUser}</Bubble>}
        {showStreaming && <Bubble role="assistant">{streaming}</Bubble>}
        {sending && !streaming && (
          <p role="status" className="self-start text-sm text-muted-foreground">
            {t("thinking")}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-crimson-950 px-3 py-2 text-sm text-crimson-100 ring-1 ring-crimson-700">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          aria-label={t("messageLabel")}
          placeholder={t("placeholder")}
          rows={1}
          maxLength={MAX_MESSAGE_CHARS}
          className="max-h-32 min-h-11 flex-1 resize-none"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <Button type="submit" disabled={sending || !text.trim()} aria-label={t("send")} className="size-11 shrink-0">
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}
