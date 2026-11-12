"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { currencies, deliveryCountries, languages, type CurrencyOption } from "@/lib/localization-options";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";
import { appTranslations } from "@/locales/app-translations";
import { storefrontTranslations } from "@/locales/storefront-translations";
import { checkoutTranslations } from "@/locales/checkout-translations";
import { contactTranslations } from "@/locales/contact-translations";
import { wishlistTranslations } from "@/locales/wishlist-translations";
import { authTranslations } from "@/locales/auth-translations";
import { orderTranslations } from "@/locales/order-translations";
import { accountTranslations } from "@/locales/account-translations";

type Dictionary = Record<string, unknown>;
type RatePayload = { base: string; date: string; rates: Record<string, number> };
type PendingTranslation = { language: string; key: string; text: string };
type LocalizationContextValue = {
  language: string;
  currency: string;
  country: string;
  deliveryNoticeDismissed: boolean;
  languages: typeof languages;
  currencies: typeof currencies;
  deliveryCountries: typeof deliveryCountries;
  rates: Record<string, number>;
  setLanguage: (language: string) => Promise<void>;
  setCurrency: (currency: string) => Promise<void>;
  setDeliveryCountry: (country: string) => Promise<void>;
  dismissDeliveryNotice: () => Promise<void>;
  t: (key: string, fallback: string, values?: Record<string, string | number>) => string;
  formatPrice: (amount: number, sourceCurrency?: string) => string;
  convertMajorAmount: (amount: number, sourceCurrency?: string) => number;
};

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

function getValue(dictionary: Dictionary | null, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[part];
  }, dictionary);
}

function substitute(value: string, values?: Record<string, string | number>) {
  if (!values) return value;
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => String(values[key] ?? match));
}

export function LocalizationProvider({ children, initialLanguage = "en", initialCurrency = "JPY", initialCountry = "JP", initialDeliveryNoticeDismissed = false }: { children: ReactNode; initialLanguage?: string; initialCurrency?: string; initialCountry?: string; initialDeliveryNoticeDismissed?: boolean }) {
  const router = useRouter();
  const [language, setLanguageState] = useState(languages.some((item) => item.code === initialLanguage) ? initialLanguage : "en");
  const [currency, setCurrencyState] = useState(currencies.some((item) => item.code === initialCurrency) ? initialCurrency : "JPY");
  const [country, setCountryState] = useState(deliveryCountries.some((item) => item.code === initialCountry) ? initialCountry : "JP");
  const [deliveryNoticeDismissed, setDeliveryNoticeDismissed] = useState(initialDeliveryNoticeDismissed);
  const [dictionary, setDictionary] = useState<{ language: string; value: Dictionary } | null>(null);
  const [automaticTranslations, setAutomaticTranslations] = useState<Record<string, string>>({});
  const [rates, setRates] = useState<Record<string, number>>({ JPY: 1 });
  const pendingTranslations = useRef<Map<string, PendingTranslation>>(new Map());
  const requestedTranslations = useRef<Set<string>>(new Set());
  const translationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    document.documentElement.lang = language;
    let alive = true;
    fetch(`/api/locales/${encodeURIComponent(language)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Dictionary> : null)
      .then((payload) => { if (alive && payload) setDictionary({ language, value: payload }); })
      .catch(() => { /* Reviewed app translations remain available offline. */ });
    return () => { alive = false; };
  }, [language]);

  useEffect(() => {
    let alive = true;
    const symbols = currencies.map((item) => item.code).filter((code) => code !== "JPY").join(",");
    void (async () => {
      try {
        const backendRates = PONYO_API_BASE_URL ? await ponyoApi.getLocalizationRates(symbols) : null;
        const responseRates = backendRates ?? await fetch(`/api/localization/rates?symbols=${encodeURIComponent(symbols)}`).then((response) => response.ok ? response.json().then((payload: { data: RatePayload }) => payload.data) : null);
        if (alive && responseRates?.rates) setRates({ JPY: 1, ...responseRates.rates });
      } catch {
        if (!PONYO_API_BASE_URL) return;
        try {
          const response = await fetch(`/api/localization/rates?symbols=${encodeURIComponent(symbols)}`);
          if (!response.ok) return;
          const payload = await response.json() as { data: RatePayload };
          if (alive && payload.data?.rates) setRates({ JPY: 1, ...payload.data.rates });
        } catch { /* JPY remains available when the FX source is offline. */ }
      }
    })();
    return () => { alive = false; };
  }, []);

  const savePreference = useCallback(async (next: { language?: string; currency?: string; country?: string; deliveryNoticeDismissed?: boolean }) => {
    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Unable to save localization preference");
    } catch { /* selection remains active in this tab when preference storage is unavailable */ }
  }, []);

  const setLanguage = useCallback(async (next: string) => {
    if (!languages.some((item) => item.code === next)) return;
    setLanguageState(next);
    await savePreference({ language: next });
    router.refresh();
  }, [router, savePreference]);

  const setCurrency = useCallback(async (next: string) => {
    if (!currencies.some((item) => item.code === next)) return;
    setCurrencyState(next);
    await savePreference({ currency: next });
  }, [savePreference]);

  const setDeliveryCountry = useCallback(async (next: string) => {
    if (!deliveryCountries.some((item) => item.code === next)) return;
    setCountryState(next);
    await savePreference({ country: next });
  }, [savePreference]);

  const dismissDeliveryNotice = useCallback(async () => {
    setDeliveryNoticeDismissed(true);
    await savePreference({ deliveryNoticeDismissed: true });
  }, [savePreference]);

  const convertMajorAmount = useCallback((amount: number, sourceCurrency = "JPY") => {
    const source = sourceCurrency.toUpperCase();
    if (source === currency) return amount;
    const sourceRate = rates[source];
    const targetRate = rates[currency];
    if (!sourceRate || !targetRate) return amount;
    return amount / sourceRate * targetRate;
  }, [currency, rates]);

  const formatPrice = useCallback((amount: number, sourceCurrency = "JPY") => {
    const selected = currencies.find((item) => item.code === currency) as CurrencyOption;
    const localizedAmount = convertMajorAmount(amount, sourceCurrency);
    const formatterLocale = language === "en" ? "en-US" : language === "es" ? "es-ES" : language === "pt-BR" ? "pt-BR" : language === "pt-PT" ? "pt-PT" : language;
    try {
      return new Intl.NumberFormat(formatterLocale, {
        style: "currency",
        currency,
        minimumFractionDigits: selected.digits,
        maximumFractionDigits: selected.digits,
      }).format(localizedAmount);
    } catch {
      return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: selected.digits }).format(localizedAmount);
    }
  }, [convertMajorAmount, currency, language]);

  const flushTranslations = useCallback(async () => {
    translationTimer.current = null;
    const queued = [...pendingTranslations.current.entries()];
    pendingTranslations.current.clear();
    const grouped = new Map<string, Array<{ requestId: string; key: string; text: string }>>();
    for (const [requestId, entry] of queued) {
      const entries = grouped.get(entry.language) ?? [];
      entries.push({ requestId, key: entry.key, text: entry.text });
      grouped.set(entry.language, entries);
    }

    for (const [locale, entries] of grouped) {
      for (let index = 0; index < entries.length; index += 24) {
        const batch = entries.slice(index, index + 24);
        try {
          const response = await fetch("/api/localization/translations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locale, entries: batch.map(({ key, text }) => ({ key, text })) }),
          });
          if (!response.ok) continue;
          const payload = await response.json() as { data?: { translations?: Record<string, string> } };
          const translations = payload.data?.translations;
          if (translations) {
            setAutomaticTranslations((current) => {
              const next = { ...current };
              for (const [key, text] of Object.entries(translations)) {
                next[`${locale}:${key}`] = text;
              }
              return next;
            });
          }
        } catch {
          // Keep the existing locale dictionary or English fallback when AWS is unavailable.
        }
      }
    }
  }, []);

  const queueTranslation = useCallback((locale: string, key: string, text: string) => {
    if (typeof window === "undefined" || locale === "en" || !text.trim()) return;
    const requestId = `${locale}:${key}:${text}`;
    if (requestedTranslations.current.has(requestId)) return;
    requestedTranslations.current.add(requestId);
    pendingTranslations.current.set(requestId, { language: locale, key, text });
    if (translationTimer.current === null) {
      translationTimer.current = setTimeout(() => { void flushTranslations(); }, 120);
    }
  }, [flushTranslations]);

  const t = useCallback((key: string, fallback: string, values?: Record<string, string | number>) => {
    const activeDictionary = dictionary?.language === language ? dictionary.value : null;
    const automaticValue = automaticTranslations[`${language}:${key}`];
    const appValue = authTranslations[language]?.[key] ?? accountTranslations[language]?.[key] ?? orderTranslations[language]?.[key] ?? contactTranslations[language]?.[key] ?? wishlistTranslations[language]?.[key] ?? checkoutTranslations[language]?.[key] ?? storefrontTranslations[language]?.[key] ?? appTranslations[language]?.[key];
    const dictionaryValue = getValue(activeDictionary, key);
    const reviewedValue = appValue ?? dictionaryValue;
    if (!reviewedValue && !automaticValue) queueTranslation(language, key, fallback);
    // Machine translation must never overwrite reviewed, app-owned copy.
    const value = reviewedValue ?? automaticValue;
    return substitute(typeof value === "string" && value.trim() ? value : fallback, values);
  }, [automaticTranslations, dictionary, language, queueTranslation]);

  const contextValue = useMemo(() => ({ language, currency, country, deliveryNoticeDismissed, languages, currencies, deliveryCountries, rates, setLanguage, setCurrency, setDeliveryCountry, dismissDeliveryNotice, t, formatPrice, convertMajorAmount }), [language, currency, country, deliveryNoticeDismissed, rates, setLanguage, setCurrency, setDeliveryCountry, dismissDeliveryNotice, t, formatPrice, convertMajorAmount]);
  return <LocalizationContext.Provider value={contextValue}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  const value = useContext(LocalizationContext);
  if (!value) throw new Error("useLocalization must be used inside LocalizationProvider");
  return value;
}

export function LocalizedText({ translationKey, fallback, values, as, ...props }: { translationKey: string; fallback: string; values?: Record<string, string | number>; as?: ElementType } & HTMLAttributes<HTMLElement>) {
  const { t } = useLocalization();
  const Tag = as ?? "span";
  const elementProps = props;
  return <Tag {...elementProps}>{t(translationKey, fallback, values)}</Tag>;
}

export function LocalizedPrice({ amount, sourceCurrency = "JPY", className }: { amount: number; sourceCurrency?: string; className?: string }) {
  const { formatPrice } = useLocalization();
  return <span className={className}>{formatPrice(amount, sourceCurrency)}</span>;
}
