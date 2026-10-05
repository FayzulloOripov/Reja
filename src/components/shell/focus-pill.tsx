"use client";

import { Coffee, Timer } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useFocus, useFocusEngine } from "@/store/focus";

/** Runs the focus engine and shows a small live timer when focus is running elsewhere. */
export function FocusPill() {
  useFocusEngine();
  const pathname = usePathname();
  const { running, endsAt, phase } = useFocus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  if (!running || !endsAt || pathname.startsWith("/focus")) return null;
  const s = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return (
    <Link
      href="/focus"
      className="fixed top-3 right-3 z-40 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow-elev-3 tnum md:top-4 md:right-4"
    >
      {phase === "work" ? <Timer className="size-3.5" /> : <Coffee className="size-3.5" />}
      {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </Link>
  );
}
