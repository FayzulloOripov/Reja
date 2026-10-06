import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "@/lib/parse/quick-add";

// Monday, 5 October 2026, 11:00 in Tashkent
const ctx = {
  today: "2026-10-05",
  nowMinutes: 11 * 60,
  projects: [
    { id: "p-top", name: "Topcoach" },
    { id: "p-ag", name: "Agentlik" },
    { id: "p-hos", name: "Hormozi OS" },
    { id: "p-sog", name: "Sogʻliq" },
  ],
  people: [
    { id: "u-asila", name: "Asila Karimova" },
    { id: "u-bahmanyor", name: "Bahmanyor" },
  ],
};

const parse = (s: string) => parseQuickAdd(s, ctx);

describe("Uzbek dates and times", () => {
  it("parses ertaga + time, project, priority and top 3", () => {
    const r = parse("Hisobotni yuborish ertaga 10:00 #Topcoach !1 *");
    expect(r.title).toBe("Hisobotni yuborish");
    expect(r.dueDate).toBe("2026-10-06");
    expect(r.dueTime).toBe("10:00");
    expect(r.projectId).toBe("p-top");
    expect(r.priority).toBe("urgent");
    expect(r.top).toBe(true);
    expect(r.chips.map((c) => c.kind)).toEqual(["date", "time", "project", "priority", "top"]);
  });

  it("parses bugun and indinga", () => {
    expect(parse("Qoʻngʻiroq qilish bugun").dueDate).toBe("2026-10-05");
    expect(parse("Toʻlov indinga").dueDate).toBe("2026-10-07");
  });

  it("parses weekdays (strictly after today) with Uzbek suffixes", () => {
    expect(parse("Uchrashuv dushanba").dueDate).toBe("2026-10-12");
    expect(parse("Uchrashuv chorshanbaga").dueDate).toBe("2026-10-07");
    expect(parse("Hisobot juma kuni").dueDate).toBe("2026-10-09");
    expect(parse("Hisobot juma kuni").title).toBe("Hisobot");
    expect(parse("Reja keyingi seshanba").dueDate).toBe("2026-10-13");
  });

  it("parses soat … da and day-part words", () => {
    const r = parse("Mijozga qoʻngʻiroq soat 15 da");
    expect(r.dueTime).toBe("15:00");
    expect(r.dueDate).toBe("2026-10-05");
    expect(r.title).toBe("Mijozga qoʻngʻiroq");
    expect(parse("Sport kechqurun 7").dueTime).toBe("19:00");
    expect(parse("Kitob oʻqish ertalab").dueTime).toBe("09:00");
  });

  it("moves a bare time that has already passed to tomorrow", () => {
    const r = parse("Dori ichish 08:00");
    expect(r.dueDate).toBe("2026-10-06");
    expect(r.dueTime).toBe("08:00");
  });

  it("parses absolute dates", () => {
    expect(parse("Shartnoma 15-oktabr").dueDate).toBe("2026-10-15");
    expect(parse("Shartnoma 3 noyabr").dueDate).toBe("2026-11-03");
    expect(parse("Soliq 20.10").dueDate).toBe("2026-10-20");
    expect(parse("Yillik hisobot 2027-01-15").dueDate).toBe("2027-01-15");
    // a date that has passed this year rolls over to next year
    expect(parse("Tugʻilgan kun 1-sentabr").dueDate).toBe("2027-09-01");
  });

  it("parses relative offsets", () => {
    expect(parse("Natijani tekshirish 3 kundan keyin").dueDate).toBe("2026-10-08");
    expect(parse("Qayta koʻrish 2 haftadan keyin").dueDate).toBe("2026-10-19");
    expect(parse("Byudjet keyingi hafta").dueDate).toBe("2026-10-12");
  });
});

describe("recurrence", () => {
  it("parses har hafta on the due weekday", () => {
    const r = parse("Haftalik hisobot har hafta juma");
    expect(r.recurrence).toBe("FREQ=WEEKLY;BYDAY=FR");
    expect(r.dueDate).toBe("2026-10-09");
    expect(r.title).toBe("Haftalik hisobot");
  });

  it("parses har kuni / har dushanba / ish kunlari", () => {
    const daily = parse("Rejani koʻrib chiqish har kuni 09:00");
    expect(daily.recurrence).toBe("FREQ=DAILY");
    expect(daily.dueDate).toBe("2026-10-06"); // 09:00 already passed today
    const monday = parse("Jamoa yigʻilishi har dushanba");
    expect(monday.recurrence).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(monday.dueDate).toBe("2026-10-05");
    expect(parse("Lidlarni tekshirish ish kunlari").recurrence).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA");
  });

  it("parses intervals", () => {
    expect(parse("Suv quyish har 3 kunda").recurrence).toBe("FREQ=DAILY;INTERVAL=3");
    expect(parse("Water plants every 2 weeks").recurrence).toBe("FREQ=WEEKLY;INTERVAL=2");
  });
});

describe("English", () => {
  it("parses tomorrow 5pm", () => {
    const r = parse("Send invoice tomorrow 5pm");
    expect(r.title).toBe("Send invoice");
    expect(r.dueDate).toBe("2026-10-06");
    expect(r.dueTime).toBe("17:00");
  });

  it("parses weekdays, next week and month names", () => {
    expect(parse("Review friday").dueDate).toBe("2026-10-09");
    expect(parse("Plan next week").dueDate).toBe("2026-10-12");
    expect(parse("Renew domain oct 20").dueDate).toBe("2026-10-20");
    expect(parse("Conference 3rd november").dueDate).toBe("2026-11-03");
    expect(parse("Call at 9:30am").dueTime).toBe("09:30");
    expect(parse("Follow up in 3 days").dueDate).toBe("2026-10-08");
  });

  it("parses every monday / weekdays / daily", () => {
    expect(parse("Standup every monday").recurrence).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(parse("Inbox zero daily").recurrence).toBe("FREQ=DAILY");
    expect(parse("Check leads every weekday").recurrence).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA");
  });
});

describe("projects, people, priority, top", () => {
  it("matches multi-word project names and apostrophe variants", () => {
    expect(parse("Audit #Hormozi OS").projectId).toBe("p-hos");
    expect(parse("Audit #Hormozi OS").title).toBe("Audit");
    expect(parse("Yugurish #sog'liq").projectId).toBe("p-sog");
    expect(parse("Yugurish #Sog’liq").projectId).toBe("p-sog");
  });

  it("matches a unique project by the start of its name", () => {
    expect(parse("Hisobot #Top").projectId).toBe("p-top");
    expect(parse("Audit #hormozi").projectId).toBe("p-hos");
  });

  it("reports unknown projects without keeping them in the title", () => {
    const r = parse("Yangi ish #Nomaʼlum");
    expect(r.projectId).toBeNull();
    expect(r.unknownProject).toBe("Nomaʼlum");
    expect(r.title).toBe("Yangi ish");
  });

  it("assigns people by first name or full name", () => {
    expect(parse("Xabarlarni tekshir @Asila").assigneeIds).toEqual(["u-asila"]);
    expect(parse("Xabarlarni tekshir @asila karimova").assigneeIds).toEqual(["u-asila"]);
    expect(parse("Kelishuv @Bahmanyor @Asila").assigneeIds).toEqual(["u-bahmanyor", "u-asila"]);
  });

  it("maps !1…!4 to priorities", () => {
    expect(parse("a !1").priority).toBe("urgent");
    expect(parse("a !2").priority).toBe("high");
    expect(parse("a !3").priority).toBe("medium");
    expect(parse("a !4").priority).toBe("low");
    expect(parse("a !5").priority).toBeNull();
  });

  it("only treats a standalone * as top 3", () => {
    expect(parse("Muhim * ish").top).toBe(true);
    expect(parse("5*3 hisoblash").top).toBe(false);
  });

  it("leaves ordinary numbers and words alone", () => {
    const r = parse("10 ta xabar qoralamasini tekshirish");
    expect(r.title).toBe("10 ta xabar qoralamasini tekshirish");
    expect(r.dueDate).toBeNull();
    expect(r.dueTime).toBeNull();
    const s = parse("Avgust tushumi farqini solishtirish: 100,3 mln va 124,3 mln");
    expect(s.dueDate).toBeNull();
    expect(s.title).toBe("Avgust tushumi farqini solishtirish: 100,3 mln va 124,3 mln");
  });

  it("does not mistake e-mail addresses for people or projects", () => {
    const r = parse("Write to asila@example.com");
    expect(r.assigneeIds).toEqual([]);
    expect(r.title).toBe("Write to asila@example.com");
  });
});

describe("fix-prompt checklist", () => {
  it("parses the tester's sentence: ertaga 10:00 #Agentlik @Hamkor !1 *", () => {
    const r = parseQuickAdd("Asila bilan uchrashuv ertaga 10:00 #Agentlik @Hamkor !1 *", { ...ctx, people: [{ id: "u-h", name: "Hamkor (demo)" }] });
    expect(r).toMatchObject({ title: "Asila bilan uchrashuv", dueDate: "2026-10-06", dueTime: "10:00", projectId: "p-ag", priority: "urgent", top: true });
    expect(r.assigneeIds).toEqual(["u-h"]);
  });

  it("har kuni 7:00 → daily at 07:00, starting tomorrow when 07:00 has passed", () => {
    const r = parse("Yugurish har kuni 7:00");
    expect(r.recurrence).toBe("FREQ=DAILY");
    expect(r.dueTime).toBe("07:00");
    expect(r.dueDate).toBe("2026-10-06");
    expect(r.title).toBe("Yugurish");
  });

  it("dushanba means next Monday when today is Monday", () => {
    expect(parse("Reja dushanba").dueDate).toBe("2026-10-12");
  });

  it("!2, !3, !4 map to high, medium, low", () => {
    expect(parse("a !2").priority).toBe("high");
    expect(parse("b !3").priority).toBe("medium");
    expect(parse("c !4").priority).toBe("low");
  });

  it("treats ' ’ ʻ ʼ the same in project names", () => {
    for (const a of ["'", "’", "ʻ", "ʼ"]) expect(parse(`Yugurish #Sog${a}liq`).projectId).toBe("p-sog");
  });

  it("English: tomorrow 5pm, every week", () => {
    expect(parse("Call tomorrow 5pm")).toMatchObject({ dueDate: "2026-10-06", dueTime: "17:00", title: "Call" });
    expect(parse("Review every week").recurrence).toMatch(/^FREQ=WEEKLY/);
  });
});
