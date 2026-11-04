import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { tradesCsv, transactionsCsv } from "@/features/backup/logic";
import { readAllRows } from "@/features/backup/service";
import { getScheduleContext } from "@/features/schedule/context";

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "transactions" && kind !== "trades") return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const ctx = await getScheduleContext();
    const csv =
      kind === "trades"
        ? tradesCsv(await readAllRows(ctx.repo, "trades"))
        : transactionsCsv(await readAllRows(ctx.repo, "transactions"), await readAllRows(ctx.repo, "fin_categories"));
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="my-schedule-${kind}-${ctx.today}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
