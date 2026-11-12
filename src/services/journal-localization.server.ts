import "server-only";

import { cookies } from "next/headers";
import { languages } from "@/lib/localization-options";
import { journalUI, type JournalUIKey } from "@/locales/journal-ui";

export async function getJournalLocalization() {
  const selected = (await cookies()).get("ponyo-language")?.value;
  const locale = languages.find(({ code }) => code === selected)?.code ?? "en";

  function ui(key: JournalUIKey, fallback?: string, values: Record<string, string | number> = {}) {
    const template = journalUI[locale]?.[key] ?? journalUI.en[key] ?? fallback ?? key;
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : placeholder,
    );
  }

  function formatDate(date: string) {
    return new Intl.DateTimeFormat(locale === "en" ? "en-US" : locale, {
      year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
  }

  return { locale, ui, formatDate };
}