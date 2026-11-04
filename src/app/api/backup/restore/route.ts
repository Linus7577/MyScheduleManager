import { gunzipSync } from "node:zlib";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { MAX_BACKUP_BYTES } from "@/features/backup/logic";
import { restoreFromText } from "@/features/backup/service";
import { getScheduleContext } from "@/features/schedule/context";

/**
 * Replaces everything, so it asks for more than a normal request. A page on another site can't send a custom header
 * without the browser asking this server's permission first, which it never gives.
 */
export async function POST(request: Request) {
  if (request.headers.get("x-restore-confirm") !== "replace-everything") {
    return NextResponse.json({ ok: false, code: "invalid" }, { status: 403 });
  }

  let text: string;
  try {
    // The limit stops a small file that unpacks into something enormous.
    const unpacked = gunzipSync(Buffer.from(await request.arrayBuffer()), { maxOutputLength: MAX_BACKUP_BYTES });
    text = unpacked.toString("utf8");
  } catch {
    return NextResponse.json({ ok: false, code: "badBackupFile" }, { status: 400 });
  }

  try {
    const ctx = await getScheduleContext();
    const result = await restoreFromText(ctx, text);
    if (result.ok) revalidatePath("/", "layout");
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
