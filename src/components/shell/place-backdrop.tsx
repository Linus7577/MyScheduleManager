"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Each section is its own place in one world. The longest matching start of the address wins. */
const PLACES: { path: string; place: string }[] = [
  { path: "/loop", place: "warTable" },
  { path: "/calendar", place: "observatory" },
  { path: "/oracle", place: "sanctum" },
  { path: "/finance", place: "hoard" },
  { path: "/vault", place: "archive" },
  { path: "/goals", place: "campaign" },
  { path: "/learning", place: "tower" },
  { path: "/habits", place: "grounds" },
  { path: "/battle-log", place: "records" },
  { path: "/review", place: "records" },
  { path: "/doom", place: "clocktower" },
  { path: "/focus", place: "clocktower" },
  { path: "/more", place: "gate" },
  { path: "/settings", place: "armory" },
];

function placeFor(pathname: string): string | null {
  return PLACES.find(({ path }) => pathname === path || pathname.startsWith(`${path}/`))?.place ?? null;
}

/** Paints the section's place behind everything, and sets the accent color its panels pick up. Home has its own. */
export function PlaceBackdrop() {
  const place = placeFor(usePathname());
  if (!place) return null;
  return <div aria-hidden="true" data-place={place} className="place-backdrop fixed inset-0 -z-10" />;
}

/** The name of the place, above the section's own title. */
export function PlaceName() {
  const t = useTranslations("places");
  const place = placeFor(usePathname());
  if (!place) return null;
  return (
    <p
      data-place={place}
      className={cn(
        "place-name mx-auto mb-2 font-heading text-xs tracking-[0.2em] uppercase",
        // The calendar needs the room, so its page is wider than the rest. The name lines up with its title.
        place === "observatory" ? "max-w-5xl" : "max-w-2xl"
      )}
    >
      {t(place)}
    </p>
  );
}

/** A short dark fade between pages. It lies over the page without touching it, and restarts each time the address changes. */
export function PageVeil() {
  return <div key={usePathname()} aria-hidden="true" className="page-veil pointer-events-none fixed inset-0 z-30" />;
}
