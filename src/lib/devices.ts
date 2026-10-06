// A readable name for a signed-in device from its user agent: "Chrome · macOS", "Safari · iPhone".

export function describeDevice(ua: string | null | undefined): { label: string; mobile: boolean } {
  if (!ua) return { label: "", mobile: false };
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /YaBrowser/.test(ua) ? "Yandex"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "";
  const os =
    /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "";
  const mobile = /iPhone|Android.*Mobile|Mobile Safari/.test(ua);
  return { label: [browser, os].filter(Boolean).join(" · "), mobile };
}
