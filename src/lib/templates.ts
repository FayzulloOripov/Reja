import type { ProjectTemplateData } from "./types";

/** Built-in starter templates (localised). Workspace templates live in the `templates` table. */
export const BUILTIN_TEMPLATES: { key: string; color: string; name: Record<"uz" | "en", string>; data: Record<"uz" | "en", ProjectTemplateData> }[] = [
  {
    key: "client",
    color: "indigo",
    name: { uz: "Mijoz loyihasi", en: "Client project" },
    data: {
      uz: {
        sections: ["Kirish", "Ish jarayoni", "Topshirish"],
        tasks: [
          { title: "Boshlangʻich uchrashuv va maqsadlarni yozish", section: "Kirish", due_offset_days: 0, priority: "high" },
          { title: "Taklif va narxni yuborish", section: "Kirish", due_offset_days: 2, checklist: ["Paket tarkibi", "Muddatlar", "Kafolat"] },
          { title: "Shartnomani imzolash", section: "Kirish", due_offset_days: 5 },
          { title: "Audit va reja", section: "Ish jarayoni", due_offset_days: 10 },
          { title: "Haftalik hisobot", section: "Ish jarayoni", due_offset_days: 14 },
          { title: "Yakuniy natijalar va fikr-mulohaza", section: "Topshirish", due_offset_days: 30 },
        ],
      },
      en: {
        sections: ["Kick-off", "Delivery", "Handover"],
        tasks: [
          { title: "Kick-off call and written goals", section: "Kick-off", due_offset_days: 0, priority: "high" },
          { title: "Send proposal and price", section: "Kick-off", due_offset_days: 2, checklist: ["Package contents", "Timeline", "Guarantee"] },
          { title: "Sign the contract", section: "Kick-off", due_offset_days: 5 },
          { title: "Audit and plan", section: "Delivery", due_offset_days: 10 },
          { title: "Weekly report", section: "Delivery", due_offset_days: 14 },
          { title: "Final results and feedback", section: "Handover", due_offset_days: 30 },
        ],
      },
    },
  },
  {
    key: "sales",
    color: "tangerine",
    name: { uz: "Sotuv boʻlimi oyi", en: "Sales month" },
    data: {
      uz: {
        sections: ["Reja", "Har hafta", "Oy yakuni"],
        tasks: [
          { title: "Oylik maqsadni menejer bilan kelishish", section: "Reja", due_offset_days: 0, priority: "high" },
          { title: "Lidlar va repslar sigʻimini hisoblash", section: "Reja", due_offset_days: 1 },
          { title: "Haftalik KPI tahlili", section: "Har hafta", due_offset_days: 6 },
          { title: "Repslar bilan 1:1 suhbatlar", section: "Har hafta", due_offset_days: 7 },
          { title: "Oylik hisobot va ish haqi hisobi", section: "Oy yakuni", due_offset_days: 29, priority: "high" },
        ],
      },
      en: {
        sections: ["Plan", "Weekly", "Month end"],
        tasks: [
          { title: "Agree on the monthly target with the manager", section: "Plan", due_offset_days: 0, priority: "high" },
          { title: "Estimate lead volume and rep capacity", section: "Plan", due_offset_days: 1 },
          { title: "Weekly KPI review", section: "Weekly", due_offset_days: 6 },
          { title: "1:1s with reps", section: "Weekly", due_offset_days: 7 },
          { title: "Monthly report and payroll", section: "Month end", due_offset_days: 29, priority: "high" },
        ],
      },
    },
  },
  {
    key: "hiring",
    color: "emerald",
    name: { uz: "Xodim yollash", en: "Hiring" },
    data: {
      uz: {
        sections: ["Tayyorgarlik", "Suhbatlar", "Qabul"],
        tasks: [
          { title: "Lavozim tavsifini yozish", section: "Tayyorgarlik", due_offset_days: 0 },
          { title: "Eʼlonni joylash", section: "Tayyorgarlik", due_offset_days: 1 },
          { title: "Nomzodlar bilan birinchi suhbat", section: "Suhbatlar", due_offset_days: 7 },
          { title: "Amaliy topshiriq", section: "Suhbatlar", due_offset_days: 10 },
          { title: "Taklif va ishga tushirish rejasi", section: "Qabul", due_offset_days: 14, checklist: ["Shartnoma", "Qoʻllanma", "Birinchi hafta rejasi"] },
        ],
      },
      en: {
        sections: ["Prepare", "Interviews", "Onboard"],
        tasks: [
          { title: "Write the job description", section: "Prepare", due_offset_days: 0 },
          { title: "Post the job", section: "Prepare", due_offset_days: 1 },
          { title: "First interviews", section: "Interviews", due_offset_days: 7 },
          { title: "Practical assignment", section: "Interviews", due_offset_days: 10 },
          { title: "Offer and onboarding plan", section: "Onboard", due_offset_days: 14, checklist: ["Contract", "Handbook", "First-week plan"] },
        ],
      },
    },
  },
];
