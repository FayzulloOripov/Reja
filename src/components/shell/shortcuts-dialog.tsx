"use client";

import { useTranslations } from "next-intl";
import { Kbd } from "@/components/common/bits";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUI } from "@/store/ui";

export function ShortcutsDialog() {
  const t = useTranslations("shortcuts");
  const open = useUI((s) => s.shortcutsOpen);
  const setOpen = useUI((s) => s.setShortcuts);
  const groups: { keys: string[][]; label: string }[][] = [
    [
      { keys: [["Q"]], label: t("quickAdd") },
      { keys: [["⌘", "K"]], label: t("palette") },
      { keys: [["?"]], label: t("help") },
      { keys: [["Esc"]], label: t("close") },
    ],
    [
      { keys: [["G"], ["H"]], label: t("goHome") },
      { keys: [["G"], ["I"]], label: t("goInbox") },
      { keys: [["G"], ["U"]], label: t("goUpcoming") },
      { keys: [["G"], ["O"]], label: t("goOverview") },
      { keys: [["G"], ["N"]], label: t("goNotifications") },
    ],
    [
      { keys: [["↑"], ["↓"]], label: t("navigate") },
      { keys: [["J"], ["K"]], label: t("navigate") },
      { keys: [["Enter"]], label: t("openTask") },
      { keys: [["E"]], label: t("complete") },
      { keys: [["X"]], label: t("select") },
      { keys: [["1"], ["2"], ["3"], ["4"], ["5"]], label: t("viewList") },
    ],
  ];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("title")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {groups.map((g, i) => (
            <ul key={i} className="space-y-2.5">
              {g.map((row) => (
                <li key={row.label + row.keys.join()} className="flex items-center justify-between gap-3 text-13">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {row.keys.map((combo, j) => (
                      <span key={j} className="flex items-center gap-0.5">
                        {j > 0 && <span className="px-0.5 text-2xs text-subtle-foreground">{row.keys.length > 2 ? "" : t("then")}</span>}
                        {combo.map((k) => (
                          <Kbd key={k}>{k}</Kbd>
                        ))}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
