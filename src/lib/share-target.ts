// What an app shares with Reja (Telegram puts the link inside `text`) → an inbox task.

const URL_RE = /https?:\/\/\S+/i;

/** Title: the shared title, else the first line of the text, else the link. Body keeps the rest and the link. */
export function sharedToTask(input: { title?: string | null; text?: string | null; url?: string | null }): { title: string; body: string | null } | null {
  const text = (input.text ?? "").trim();
  const url = (input.url ?? "").trim() || text.match(URL_RE)?.[0] || "";
  const textWithoutUrl = url ? text.replace(url, "").trim() : text;
  const firstLine = textWithoutUrl.split("\n").find((l) => l.trim())?.trim() ?? "";
  const title = ((input.title ?? "").trim() || firstLine || url).slice(0, 200);
  if (!title) return null;
  const rest = textWithoutUrl.replace(firstLine, "").trim();
  const body = [rest, url && url !== title ? url : ""].filter(Boolean).join("\n\n");
  return { title, body: body || null };
}
