/**
 * While rendering a page, Next.js answers repeated identical GET requests from memory. A page that writes a row
 * and reads it back would then see the old answer, so it never sees its own write. A signal opts out of that.
 * Repeated reads are still saved, by withRequestCache, which forgets them on any write.
 */
export const freshFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: init?.signal ?? new AbortController().signal });
