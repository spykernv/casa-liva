"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { casaDate } from "@/lib/date";

/** `2026-08-08`, dans le fuseau de la maison. */
function toInput(ms: number): string {
  const d = casaDate(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * « Quel jour ? » — l'entrée de la question inverse.
 *
 * Volontairement un seul champ. On connaît la date bien avant de savoir
 * ce qu'on fera ni avec qui : « samedi, il y a moyen ? » se pose sans
 * rien d'autre, et exiger un titre ici transformerait une question en
 * formulaire.
 */
export function DayForm({
  defaultDay,
  minDay,
  maxDay,
}: {
  defaultDay: number;
  minDay: number;
  maxDay: number;
}) {
  const [day, setDay] = useState(toInput(defaultDay));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function look() {
    startTransition(() => router.push(`/casa/trouver?jour=${day}`));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (day) look();
      }}
      className="px-4 pt-4"
    >
      <label
        htmlFor="jour"
        className="block text-[1.0625rem] font-semibold text-ink"
      >
        Quel jour&nbsp;?
      </label>
      <input
        id="jour"
        type="date"
        value={day}
        min={toInput(minDay)}
        max={toInput(maxDay)}
        onChange={(e) => setDay(e.target.value)}
        className="mt-2.5 h-14 w-full rounded-casa-md border border-line bg-surface px-4 text-base text-ink shadow-casa-sm"
      />

      <Button type="submit" size="lg" block className="mt-4" disabled={pending || !day}>
        <Search size={19} strokeWidth={2.4} aria-hidden="true" />
        {pending ? "On regarde…" : "Voir qui est libre"}
      </Button>
    </form>
  );
}
