import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { localeFilename } from "@/lib/localization-options";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ locale: string }> },
) {
	const { locale } = await params;
	const filename = localeFilename[locale];
	if (!filename)
		return NextResponse.json(
			{ error: "Unsupported language" },
			{ status: 404 },
		);

	try {
		const source = await readFile(
			join(process.cwd(), "src/locales", filename),
			"utf8",
		);
		const json = source.replace(/^\/\*[\s\S]*?\*\/\s*/, "");
		const dictionary = JSON.parse(json) as Record<string, unknown>;
		return NextResponse.json(dictionary, {
			headers: {
				"Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
			},
		});
	} catch {
		return NextResponse.json(
			{ error: "Translation file unavailable" },
			{ status: 500 },
		);
	}
}
