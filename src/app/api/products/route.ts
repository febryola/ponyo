import { NextResponse } from "next/server";
import { getProducts } from "@/services/product.service";

export async function GET() {
	const products = await getProducts();
	return NextResponse.json({ data: products });
}
