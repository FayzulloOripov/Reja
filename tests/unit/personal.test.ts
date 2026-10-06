import { describe, expect, it } from "vitest";
import { energySuggestions, freeGaps } from "@/lib/energy";
import { prayerBlockEnd, prayerBlocks } from "@/lib/prayer";
import type { Task } from "@/lib/types";

const TZ = "Asia/Tashkent";
const task = (p: Partial<Task>): Task =>
  ({ id: Math.random().toString(36), status: "todo", priority: "none", due_date: null, deleted_at: null, energy: null, estimate_min: null, title: "t", ...p }) as Task;

describe("energy labels", () => {
  it("free gaps between busy spans", () => {
    expect(freeGaps([{ start: 600, end: 660 }, { start: 670, end: 720 }], 540, 780)).toEqual([{ start: 540, end: 600 }, { start: 720, end: 780 }]);
    // a 10-minute hole is too short
    expect(freeGaps([{ start: 600, end: 660 }, { start: 670, end: 720 }], 600, 720)).toEqual([]);
  });
  it("deep work in the morning, quick tasks that fit the next gap", () => {
    const tasks = [
      task({ title: "deep", energy: "deep", due_date: "2026-10-07" }),
      task({ title: "quick 10", energy: "quick", estimate_min: 10 }),
      task({ title: "quick 45", energy: "quick", estimate_min: 45 }),
      task({ title: "far deep", energy: "deep", due_date: "2026-11-30" }),
      task({ title: "done", energy: "quick", status: "done" }),
    ];
    const morning = energySuggestions(tasks, { today: "2026-10-06", nowMin: 9 * 60, dayEnd: 22 * 60, busy: [{ start: 9 * 60 + 30, end: 11 * 60 }], horizon: "2026-10-13" });
    expect(morning.deep.map((t) => t.title)).toEqual(["deep"]);
    expect(morning.gap).toEqual({ start: 540, end: 570 });
    expect(morning.quick.map((t) => t.title)).toEqual(["quick 10"]);
    const afternoon = energySuggestions(tasks, { today: "2026-10-06", nowMin: 15 * 60, dayEnd: 22 * 60, busy: [], horizon: "2026-10-13" });
    expect(afternoon.deep).toEqual([]);
    expect(afternoon.quick.map((t) => t.title)).toEqual(["quick 10", "quick 45"]);
  });
});

describe("prayer times", () => {
  const tashkent = { prayer_enabled: true, prayer_lat: 41.2995, prayer_lng: 69.2401, prayer_madhab: "hanafi" as const, prayer_minutes: 20 };
  it("five blocks in order, in plausible local hours for Tashkent", () => {
    const blocks = prayerBlocks("2026-10-06", tashkent);
    expect(blocks.map((b) => b.key)).toEqual(["fajr", "dhuhr", "asr", "maghrib", "isha"]);
    const local = blocks.map((b) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(b.start));
    const h = local.map((x) => Number(x.slice(0, 2)));
    expect(h[0]).toBeGreaterThanOrEqual(4); // fajr before sunrise
    expect(h[0]).toBeLessThanOrEqual(6);
    expect(h[1]).toBe(12); // dhuhr around noon
    expect(h[3]).toBeGreaterThanOrEqual(17); // maghrib at sunset
    expect(h[3]).toBeLessThanOrEqual(18);
    for (const b of blocks) expect(b.end.getTime() - b.start.getTime()).toBe(20 * 60_000);
  });
  it("off, or without a location, means no blocks", () => {
    expect(prayerBlocks("2026-10-06", { ...tashkent, prayer_enabled: false })).toEqual([]);
    expect(prayerBlocks("2026-10-06", { ...tashkent, prayer_lat: null })).toEqual([]);
  });
  it("a reminder during a prayer waits until the block ends", () => {
    const dhuhr = prayerBlocks("2026-10-06", tashkent)[1];
    const inside = new Date(dhuhr.start.getTime() + 5 * 60_000);
    expect(prayerBlockEnd(inside, tashkent, "2026-10-06", "2026-10-05")).toEqual(dhuhr.end);
    expect(prayerBlockEnd(new Date(dhuhr.end.getTime() + 60_000), tashkent, "2026-10-06", "2026-10-05")).toBeNull();
  });
});

describe("share target", () => {
  it("telegram-style text with a link: first line is the title, the link goes to the description", async () => {
    const { sharedToTask } = await import("@/lib/share-target");
    expect(sharedToTask({ text: "Yangi narxlar roʻyxati\nkoʻrib chiqing https://t.me/c/123/45" })).toEqual({ title: "Yangi narxlar roʻyxati", body: "koʻrib chiqing\n\nhttps://t.me/c/123/45" });
    expect(sharedToTask({ url: "https://example.test/a" })).toEqual({ title: "https://example.test/a", body: null });
    expect(sharedToTask({ title: "Maqola", url: "https://example.test/b" })).toEqual({ title: "Maqola", body: "https://example.test/b" });
    expect(sharedToTask({ text: "  " })).toBeNull();
  });
});

describe("Google Calendar mapping", () => {
  it("timed, all-day, free, cancelled and mirrored events", async () => {
    const { mapGoogleEvent } = await import("@/lib/google-calendar");
    expect(mapGoogleEvent({ id: "a", summary: " Dentist ", start: { dateTime: "2026-10-07T10:00:00+05:00" }, end: { dateTime: "2026-10-07T11:00:00+05:00" } }, "primary")).toEqual({
      google_id: "a", calendar_id: "primary", title: "Dentist", start_at: "2026-10-07T05:00:00.000Z", end_at: "2026-10-07T06:00:00.000Z", all_day: false, time_block_id: null,
    });
    expect(mapGoogleEvent({ id: "b", summary: "Holiday", start: { date: "2026-10-08" }, end: { date: "2026-10-09" } }, "primary")).toMatchObject({ all_day: true, start_at: "2026-10-08T00:00:00.000Z", end_at: "2026-10-09T00:00:00.000Z" });
    expect(mapGoogleEvent({ id: "c", transparency: "transparent", start: { dateTime: "2026-10-07T10:00:00Z" }, end: { dateTime: "2026-10-07T11:00:00Z" } }, "primary")).toBeNull();
    expect(mapGoogleEvent({ id: "d", status: "cancelled" }, "primary")).toBeNull();
    // an occurrence of a recurring event (singleEvents=true gives ids like base_20261007T050000Z)
    expect(mapGoogleEvent({ id: "base_20261007T050000Z", start: { dateTime: "2026-10-07T05:00:00Z" }, end: { dateTime: "2026-10-07T05:30:00Z" }, extendedProperties: { private: { rejaBlock: "blk1" } } }, "primary")).toMatchObject({ time_block_id: "blk1", title: null });
  });

  it("plans the push: create new synced blocks, update changed ones, remove unsynced and deleted ones", async () => {
    const { planBlockPush } = await import("@/lib/google-calendar");
    const plan = planBlockPush(
      [
        { id: "new", sync_google: true, google_event_id: null, updated_at: "2026-10-06T08:00:00Z" },
        { id: "changed", sync_google: true, google_event_id: "g-changed", updated_at: "2026-10-06T09:00:00Z" },
        { id: "same", sync_google: true, google_event_id: "g-same", updated_at: "2026-10-06T07:00:00Z" },
        { id: "off", sync_google: false, google_event_id: "g-off", updated_at: "2026-10-06T07:00:00Z" },
      ],
      [{ google_id: "g-same", time_block_id: "same" }, { google_id: "g-gone", time_block_id: "deleted-block" }, { google_id: "other", time_block_id: null }],
      "2026-10-06T08:30:00Z",
    );
    expect(plan).toEqual({ create: ["new"], update: ["changed"], remove: ["g-off", "g-gone"], clear: ["off"] });
  });
});

describe("device names", () => {
  it("browser and system from the user agent", async () => {
    const { describeDevice } = await import("@/lib/devices");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36")).toEqual({ label: "Chrome · macOS", mobile: false });
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ label: "Safari · iPhone", mobile: true });
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36")).toEqual({ label: "Chrome · Android", mobile: true });
    expect(describeDevice(null)).toEqual({ label: "", mobile: false });
  });
});
