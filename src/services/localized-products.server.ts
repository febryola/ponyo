import "server-only";

import { cookies } from "next/headers";
import { getProductById, getProducts } from "@/services/product.service";

async function selectedLocale() {
	return (await cookies()).get("ponyo-language")?.value ?? "en";
}

export async function getLocalizedProducts(query = "") {
	return getProducts(query, await selectedLocale());
}

export async function getLocalizedProductById(id: string) {
	return getProductById(id, await selectedLocale());
}