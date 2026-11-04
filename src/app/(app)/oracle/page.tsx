import { getTranslations } from "next-intl/server";
import { OracleChat } from "@/features/oracle/components/chat";
import { OracleDragon } from "@/features/oracle/components/oracle-dragon";
import { getChatView } from "@/features/oracle/service";
import { getScheduleContext } from "@/features/schedule/context";

export default async function OraclePage(props: { searchParams: Promise<{ ask?: string }> }) {
  const [ctx, t, { ask }] = await Promise.all([getScheduleContext(), getTranslations("review"), props.searchParams]);
  const view = await getChatView(ctx);

  // The weekly review's button fills in the question. Nothing is sent until the owner sends it.
  return (
    <>
      <div aria-hidden="true" className="fixed top-[4.75rem] right-[28rem] bottom-0 left-56 -z-[5] hidden overflow-hidden md:block">
        <OracleDragon />
        <div className="oracle-veil absolute inset-0" />
      </div>
      <OracleChat
        {...view}
        now={(ctx.now ?? new Date()).toISOString()}
        initialText={ask === "adjust" ? t("adjustMessage") : undefined}
      />
    </>
  );
}
