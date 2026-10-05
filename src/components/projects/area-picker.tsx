"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ProjectDot } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createArea } from "@/store/actions";
import { useAreas } from "@/store/hooks";

const NEW = "__new__";
const NONE = "__none__";

/** Choose the project's area, or create a new one in place. */
export function AreaPicker({ workspaceId, value, onChange, id }: { workspaceId: string; value: string | null; onChange: (areaId: string | null) => void; id?: string }) {
  const t = useTranslations();
  const areas = useAreas(workspaceId);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  if (creating) {
    return (
      <div className="flex gap-2">
        <Input
          id={id}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("areas.namePlaceholder")}
          aria-label={t("areas.new")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (name.trim()) {
                onChange(createArea({ workspaceId, name }).id);
                setCreating(false);
                setName("");
              }
            }
            if (e.key === "Escape") setCreating(false);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!name.trim()}
          onClick={() => {
            onChange(createArea({ workspaceId, name }).id);
            setCreating(false);
            setName("");
          }}
        >
          {t("common.add")}
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => {
        if (v === NEW) setCreating(true);
        else onChange(v === NONE ? null : v);
      }}
    >
      <SelectTrigger id={id} className="w-full" aria-label={t("project.area")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t("areas.none")}</SelectItem>
        {areas.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <ProjectDot color={a.color} size="sm" /> {a.name}
          </SelectItem>
        ))}
        <SelectSeparator />
        <SelectItem value={NEW}>
          <Plus className="size-3.5" /> {t("areas.new")}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
