import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { backupChunks } from "@/features/backup/service";
import { getScheduleContext } from "@/features/schedule/context";

export async function GET() {
  let ctx;
  try {
    ctx = await getScheduleContext();
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const chunks = backupChunks(ctx.repo, (ctx.now ?? new Date()).toISOString());
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (error) {
        // Fails the download itself, instead of leaving a cut-off file that looks complete.
        controller.error(error);
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="my-schedule-backup-${ctx.today}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
