import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { MAX_MESSAGE_CHARS } from "@/config/oracle.config";
import { getAiProvider } from "@/features/oracle/provider-config";
import { runOracleTurn, type OracleEvent } from "@/features/oracle/service";
import { getScheduleContext } from "@/features/schedule/context";

const chatSchema = z.strictObject({ text: z.string().trim().min(1).max(MAX_MESSAGE_CHARS) });

/** Streams the Oracle's reply as one JSON event per line, so words appear as they arrive. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  let ctx;
  try {
    ctx = await getScheduleContext();
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: OracleEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await runOracleTurn({ ctx, provider: getAiProvider(), text: parsed.data.text, emit });
      } catch {
        emit({ type: "error", code: "failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
