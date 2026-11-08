import { NextResponse } from "next/server";
import { currencies } from "@/lib/localization-options";

export const revalidate = 3600;

export async function GET(request: Request) {
	const url = new URL(request.url);
	const requested = (
		url.searchParams.get("symbols") ??
		currencies
			.map((currency) => currency.code)
			.filter((code) => code !== "JPY")
			.join(",")
	)
		.split(",")
		.map((code) => code.trim().toUpperCase());
	const supported = new Set(currencies.map((currency) => currency.code));
	if (
		requested.some((code) => !supported.has(code)) ||
		requested.includes("JPY")
	) {
		return NextResponse.json(
			{ error: "Unsupported currency" },
			{ status: 400 },
		);
	}
	const symbols = requested.length
		? requested.join(",")
		: "USD,EUR,GBP,AUD,CAD,IDR";

	try {
		const response = await fetch(
			`https://api.frankfurter.dev/v1/latest?base=JPY&symbols=${encodeURIComponent(symbols)}`,
			{ next: { revalidate: 3600 } },
		);
		if (!response.ok)
			return NextResponse.json(
				{ error: "Exchange rates are temporarily unavailable" },
				{ status: 503 },
			);
		const payload = (await response.json()) as {
			base: string;
			date: string;
			rates: Record<string, number>;
		};
		return NextResponse.json(
			{ data: payload },
			{
				headers: {
					"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
				},
			},
		);
	} catch {
		return NextResponse.json(
			{ error: "Exchange rates are temporarily unavailable" },
			{ status: 503 },
		);
	}
}
