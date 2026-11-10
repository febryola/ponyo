import { NextResponse } from "next/server";
import { getLocalizedProducts } from "@/services/localized-products.server";

export async function GET() {
	const products = await getLocalizedProducts();
	return NextResponse.json({ data: products });
}
