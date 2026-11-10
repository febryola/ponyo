"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ElementType, type HTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { currencies, deliveryCountries, languages, type CurrencyOption } from "@/lib/localization-options";
import { ponyoApi, PONYO_API_BASE_URL } from "@/services/ponyo-api.client";

type Dictionary = Record<string, unknown>;
type RatePayload = { base: string; date: string; rates: Record<string, number> };
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
  const [rates, setRates] = useState<Record<string, number>>({ JPY: 1 });

  useEffect(() => {
    document.documentElement.lang = language;
    let alive = true;
    fetch(`/api/locales/${encodeURIComponent(language)}`, { cache: "force-cache" })
      .then((response) => response.ok ? response.json() as Promise<Dictionary> : null)
      .then((payload) => { if (alive && payload) setDictionary({ language, value: payload }); });
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
    void savePreference({ language: next });
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

  const t = useCallback((key: string, fallback: string, values?: Record<string, string | number>) => {
    const activeDictionary = dictionary?.language === language ? dictionary.value : null;
    const value = getValue(activeDictionary, key);
    return substitute(typeof value === "string" && value.trim() ? value : fallback, values);
  }, [dictionary, language]);

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
