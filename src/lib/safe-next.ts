const BASE = "https://reja.invalid";

/**
 * The page to go to after signing in, from an untrusted ?next= value: only a path on this site.
 * "/\evil.com", "/\t/evil.com" and "//evil.com" all resolve to another host in a browser, so the
 * value is resolved the way a browser would and kept only when it stays on this origin.
 */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
