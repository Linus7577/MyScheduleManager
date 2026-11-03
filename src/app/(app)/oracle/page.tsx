import { OracleChat } from "@/features/oracle/components/chat";
import { getChatView } from "@/features/oracle/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function OraclePage() {
  const ctx = await getScheduleContext();
  const view = await getChatView(ctx);

  return <OracleChat {...view} now={(ctx.now ?? new Date()).toISOString()} />;
}
