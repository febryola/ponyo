import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
	currencies,
	deliveryCountries,
	languages,
} from "@/lib/localization-options";

export async function POST(request: Request) {
	let body: {
		language?: unknown;
		currency?: unknown;
		country?: unknown;
		deliveryNoticeDismissed?: unknown;
		cookieConsent?: unknown;
		optionalAnalytics?: unknown;
		optionalMarketing?: unknown;
	};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });
	}

	const language =
		typeof body.language === "string" &&
		languages.some((option) => option.code === body.language)
			? body.language
			: null;
	const currency =
		typeof body.currency === "string" &&
		currencies.some((option) => option.code === body.currency)
			? body.currency
			: null;
	const country =
		typeof body.country === "string" &&
		deliveryCountries.some((option) => option.code === body.country)
			? body.country
			: null;
	const deliveryNoticeDismissed = body.deliveryNoticeDismissed === true;
	const cookieConsent =
		body.cookieConsent === "all" ||
		body.cookieConsent === "necessary" ||
		body.cookieConsent === "custom"
			? body.cookieConsent
			: null;
	const optionalAnalytics = body.optionalAnalytics === true;
	const optionalMarketing = body.optionalMarketing === true;
	if (
		!language &&
		!currency &&
		!country &&
		!deliveryNoticeDismissed &&
		!cookieConsent
	)
		return NextResponse.json(
			{ error: "No supported preference was provided" },
			{ status: 400 },
		);

	const cookieStore = await cookies();
	const options = {
		path: "/",
		maxAge: 60 * 60 * 24 * 365,
		sameSite: "lax" as const,
		secure: process.env.NODE_ENV === "production",
	};
	if (language) cookieStore.set("ponyo-language", language, options);
	if (currency) cookieStore.set("ponyo-currency", currency, options);
	if (country) cookieStore.set("ponyo-country", country, options);
	if (deliveryNoticeDismissed)
		cookieStore.set("ponyo-delivery-notice-dismissed", "1", options);
	if (cookieConsent)
		cookieStore.set("ponyo-cookie-consent", cookieConsent, options);
	if (cookieConsent)
		cookieStore.set(
			"ponyo-analytics-consent",
			optionalAnalytics ? "1" : "0",
			options,
		);
	if (cookieConsent)
		cookieStore.set(
			"ponyo-marketing-consent",
			optionalMarketing ? "1" : "0",
			options,
		);

	return NextResponse.json({
		data: {
			language: language ?? cookieStore.get("ponyo-language")?.value ?? "en",
			currency: currency ?? cookieStore.get("ponyo-currency")?.value ?? "JPY",
			country: country ?? cookieStore.get("ponyo-country")?.value ?? "JP",
			deliveryNoticeDismissed:
				deliveryNoticeDismissed ||
				cookieStore.get("ponyo-delivery-notice-dismissed")?.value === "1",
			cookieConsent:
				cookieConsent ?? cookieStore.get("ponyo-cookie-consent")?.value ?? null,
			optionalAnalytics: cookieConsent
				? optionalAnalytics
				: cookieStore.get("ponyo-analytics-consent")?.value === "1",
			optionalMarketing: cookieConsent
				? optionalMarketing
				: cookieStore.get("ponyo-marketing-consent")?.value === "1",
		},
	});
}
