import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const apiBase = (
		process.env.PONYO_API_BASE_URL ??
		process.env.NEXT_PUBLIC_PONYO_API_BASE_URL ??
		(process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : "")
	).replace(/\/$/, "");
	if (!apiBase) {
		return NextResponse.json(
			{ error: "Automatic translation service is not configured." },
			{ status: 503 },
		);
	}

	try {
		const payload: unknown = await request.json();
		const response = await fetch(`${apiBase}/v1/localization/translations`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			cache: "no-store",
		});
		const result: unknown = await response.json();
		return NextResponse.json(result, { status: response.status });
	} catch {
		return NextResponse.json(
			{ error: "Automatic translation service is temporarily unavailable." },
			{ status: 503 },
		);
	}
}
