import Image from "next/image";
import { cn } from "@/lib/utils";

/** The Oracle is the dragon. The same picture, cut into wings, body and head, so each can move on its own. */
export function OracleDragon() {
  const art = "/art/oracle/dragon.webp";
  const layer = "absolute inset-0 size-full select-none";
  return (
    <div className="oracle-dragon absolute aspect-[826/1100] -translate-x-1/2">
      <div className="dragon-breathe absolute inset-0">
        <Image src={art} alt="" fill unoptimized draggable={false} className={cn(layer, "dragon-wing-left")} />
        <Image src={art} alt="" fill unoptimized draggable={false} className={cn(layer, "dragon-wing-right")} />
        <Image src={art} alt="" fill unoptimized draggable={false} className={cn(layer, "dragon-body")} />
        <span className="dragon-veins absolute" />
        <div className="dragon-head-sway absolute inset-0">
          <Image src={art} alt="" fill unoptimized draggable={false} className={cn(layer, "dragon-head")} />
          <span className="dragon-maw absolute" />
          <span className="dragon-eye absolute" />
        </div>
      </div>
    </div>
  );
}
