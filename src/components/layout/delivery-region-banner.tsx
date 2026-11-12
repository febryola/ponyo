"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocalization } from "@/components/layout/localization-provider";
import { regionName } from "@/lib/localization-options";

export function DeliveryRegionBanner() {
	const { language, country, deliveryCountries, setDeliveryCountry, deliveryNoticeDismissed, dismissDeliveryNotice, t } = useLocalization();
	const [modalOpen, setModalOpen] = useState(false);
	const [query, setQuery] = useState("");
	const localizedCountries = useMemo(() => deliveryCountries.map((item) => ({ ...item, label: regionName(item.code, language, item.label) })), [deliveryCountries, language]);
	const selectedCountry = localizedCountries.find((item) => item.code === country) ?? localizedCountries[0];
	const filteredCountries = useMemo(() => {
		const search = query.trim().toLocaleLowerCase();
		return search
			? localizedCountries.filter((item) => `${item.label} ${item.code} ${deliveryCountries.find((entry) => entry.code === item.code)?.label}`.toLocaleLowerCase().includes(search))
			: localizedCountries;
	}, [deliveryCountries, localizedCountries, query]);

	useEffect(() => {
		if (!modalOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setModalOpen(false);
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [modalOpen]);

	return (
		<section className={`delivery-region-banner${modalOpen ? " is-location-open" : ""}`} aria-label={t("delivery.region_label", "Delivery country")}>
			<div className="delivery-region-topbar">
				<button type="button" className="delivery-region-trigger" aria-expanded={modalOpen} aria-haspopup="dialog" onClick={() => { setQuery(""); setModalOpen(true); }}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="2"/></svg>
					<span>{t("delivery.deliver_to", "Deliver to")} <b>{selectedCountry.label}</b></span>
					<svg className="delivery-region-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
				</button>
			</div>
			{!deliveryNoticeDismissed && <div className="delivery-region-notice">
				<p>{t("delivery.shipping_notice", "We’re showing you items that ship to {{country}}. To see items that ship to a different country, change your delivery address.", { country: selectedCountry.label })}</p>
				<div className="delivery-region-actions">
					<button type="button" className="delivery-region-dismiss" onClick={() => { void dismissDeliveryNotice(); }}>{t("general.dismiss", "Dismiss")}</button>
					<button type="button" className="delivery-region-change" onClick={() => { setQuery(""); setModalOpen(true); }}>{t("delivery.change_address", "Change address")}</button>
				</div>
			</div>}

			{modalOpen && <div className="delivery-location-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
				<section className="delivery-location-modal" role="dialog" aria-modal="true" aria-labelledby="delivery-location-title">
					<header className="delivery-location-heading">
						<h2 id="delivery-location-title">{t("delivery.choose_country", "Choose your location")}</h2>
						<button type="button" onClick={() => setModalOpen(false)}>{t("general.done", "Done")}</button>
					</header>
					<p className="delivery-location-description">{t("delivery.location_description", "Delivery options and delivery speeds may vary by location.")}</p>
					<Link className="delivery-location-signin" href="/account">{t("delivery.sign_in_addresses", "Sign in to see your addresses")}</Link>
					<div className="delivery-location-current"><span aria-hidden="true">📍</span><span>{t("delivery.deliver_to", "Deliver to")} <b>{selectedCountry.label}</b></span><span className="delivery-region-flag" aria-hidden="true">{selectedCountry.flag}</span></div>
					<label className="delivery-country-search"><span aria-hidden="true">⌕</span><input type="search" aria-label={t("delivery.search_country", "Search countries")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("delivery.search_country", "Search countries")} /></label>
					<div className="delivery-country-options" role="listbox" aria-label={t("delivery.available_countries", "Available delivery countries")}>
						{filteredCountries.map((item) => <button type="button" role="option" aria-selected={country === item.code} key={item.code} onClick={() => {
							setModalOpen(false);
							void setDeliveryCountry(item.code);
							void dismissDeliveryNotice();
						}}>
							<span aria-hidden="true">{item.flag}</span><b>{item.label}</b><small>{item.code}</small>{country === item.code && <span className="delivery-country-check" aria-hidden="true">✓</span>}
						</button>)}
						{filteredCountries.length === 0 && <p>{t("delivery.no_countries", "No countries found. Try another search.")}</p>}
					</div>
				</section>
			</div>}
		</section>
	);
}