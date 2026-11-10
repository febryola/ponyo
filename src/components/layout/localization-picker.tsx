"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalization } from "@/components/layout/localization-provider";

type PickerTab = "language" | "currency";

export function LocalizationPicker({ compact = false }: { compact?: boolean }) {
  const { language, currency, languages, currencies, rates, setLanguage, setCurrency, t } = useLocalization();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>("language");
  const [query, setQuery] = useState("");
  const wrapper = useRef<HTMLDivElement>(null);
  const selectedLanguage = languages.find((item) => item.code === language) ?? languages[0];
  const selectedCurrency = currencies.find((item) => item.code === currency) ?? currencies[0];

  const filteredLanguages = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return languages;
    return languages.filter((item) => `${item.label} ${item.country} ${item.code}`.toLocaleLowerCase().includes(search));
  }, [languages, query]);

  const filteredCurrencies = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    if (!search) return currencies;
    return currencies.filter((item) => `${item.label} ${item.country} ${item.code}`.toLocaleLowerCase().includes(search));
  }, [currencies, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function switchTab(next: PickerTab) {
    setTab(next);
    setQuery("");
  }

  return (
    <div className={`localization-picker${compact ? " is-compact" : ""}`} ref={wrapper}>
      <button
        type="button"
        className="store-localization-trigger"
        aria-label={t("localization.change_language", `Language ${selectedLanguage.label}, currency ${selectedCurrency.label}. Change language or currency`, { language: selectedLanguage.label, currency: selectedCurrency.label })}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="localization-trigger-language"><b>{selectedLanguage.code.toUpperCase()}</b></span>
        <i aria-hidden="true">·</i>
        <span className="localization-trigger-currency"><b><span className="localization-currency-symbol">{selectedCurrency.symbol}</span> {selectedCurrency.code}</b></span>
        <svg className="localization-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      {open && <section className="localization-popover" role="dialog" aria-label={t("localization.form_label", "Language and currency preferences")}>
        <div className="localization-popover-heading">
          <span className="localization-sparkle" aria-hidden="true">✦</span>
          <div><strong>{t("localization.form_label", "Make it yours")}</strong><small>{t("localization.country_region_currency", "Choose your language and currency")}</small></div>
          <button type="button" className="localization-close" aria-label={t("general.close", "Close preferences")} onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="localization-tabs" role="tablist" aria-label={t("localization.form_label", "Language and currency preferences")}>
          <button type="button" role="tab" aria-selected={tab === "language"} onClick={() => switchTab("language")}>{t("localization.language", "Language")}</button>
          <button type="button" role="tab" aria-selected={tab === "currency"} onClick={() => switchTab("currency")}>{t("localization.currency", "Currency")}</button>
        </div>
        <label className="localization-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m15.2 15.2 4.8 4.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
          <input autoFocus type="search" aria-label={t("general.search", "Search")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t(tab === "language" ? "localization.search_language" : "localization.search_currency", tab === "language" ? "Search languages or countries" : "Search currencies or countries")} />
        </label>
        <div className="localization-options" role="listbox" aria-label={t(tab === "language" ? "localization.languages" : "localization.currencies", tab === "language" ? "Languages" : "Currencies")}>
          {tab === "language" ? filteredLanguages.map((item) => <button type="button" role="option" aria-selected={language === item.code} className="localization-option" key={item.code} onClick={async () => { await setLanguage(item.code); setOpen(false); }}>
            <span className="localization-flag" aria-hidden="true">{item.flag}</span><span className="localization-option-copy"><b>{item.label}</b><small>{item.country}</small></span><span className="localization-option-code">{item.code.toUpperCase()}</span>{language === item.code && <span className="localization-check" aria-hidden="true">✓</span>}
          </button>) : filteredCurrencies.map((item) => <button type="button" role="option" aria-selected={currency === item.code} className="localization-option" key={item.code} onClick={async () => { await setCurrency(item.code); setOpen(false); }}>
            <span className="localization-flag" aria-hidden="true">{item.flag}</span><span className="localization-option-copy"><b>{item.label}</b><small>{item.country}</small></span><span className="localization-option-code">{item.code}</span>{currency === item.code && <span className="localization-check" aria-hidden="true">✓</span>}
          </button>)}
          {tab === "currency" && !rates[currency] && currency !== "JPY" && <p className="localization-rates-note">{t("localization.rates_unavailable", "Exchange rates are temporarily unavailable. Display prices use the catalog currency until rates load.")}</p>}
          {((tab === "language" && filteredLanguages.length === 0) || (tab === "currency" && filteredCurrencies.length === 0)) && <p className="localization-empty">{t("localization.no_matches", "No matches yet. Try another search.")}</p>}
        </div>
        <p className="localization-popover-footnote">{t("localization.rates_note", "Prices are converted from JPY using daily reference rates.")}</p>
      </section>}
    </div>
  );
}
