export function buildCsp(input: { nonce: string; isDev: boolean; supabaseUrl: string | undefined }): string {
  const { nonce, isDev, supabaseUrl } = input;
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
  const supabaseSocket = supabaseOrigin?.replace(/^http/, "ws");

  const sources = (...values: (string | null | undefined | false)[]) => values.filter(Boolean).join(" ");

  return [
    "default-src 'self'",
    `script-src ${sources("'self'", `'nonce-${nonce}'`, "'strict-dynamic'", isDev && "'unsafe-eval'")}`,
    // Inline style attributes are needed by the UI and animation libraries. Scripts stay strict.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src ${sources("'self'", "blob:", "data:", supabaseOrigin)}`,
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src ${sources("'self'", supabaseOrigin, supabaseSocket)}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
