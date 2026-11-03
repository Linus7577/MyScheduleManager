import { createHash, timingSafeEqual } from "node:crypto";

/** Hashing first gives both values the same length, which timingSafeEqual requires. A missing secret refuses everyone. */
export function isAuthorizedCron(authorizationHeader: string | null, cronSecret: string | undefined): boolean {
  if (!cronSecret || !authorizationHeader) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorizationHeader), digest(`Bearer ${cronSecret}`));
}
