import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
	fetchShopifyCatalog,
	mapShopifyProduct,
} from "@/services/shopify.service";

function slugify(value: string) {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

export async function POST(request: Request) {
	const syncToken = process.env.PONYO_CATALOG_SYNC_TOKEN;
	if (!syncToken) {
		return NextResponse.json(
			{ error: "Catalog sync is not configured." },
			{ status: 503 },
		);
	}
	if (request.headers.get("authorization") !== `Bearer ${syncToken}`) {
		return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
	}

	const supabase = getSupabaseAdminClient();
	if (!supabase) {
		return NextResponse.json(
			{ error: "Supabase service-role access is not configured." },
			{ status: 503 },
		);
	}

	try {
		const records = await fetchShopifyCatalog({ fresh: true });
		let synced = 0;

		for (const record of records) {
			const product = mapShopifyProduct(record);
			if (!product || !record.variants[0]) continue;

			const { data: existingSupplier, error: supplierLookupError } =
				await supabase
					.from("suppliers")
					.select("id")
					.eq("name", product.supplierName)
					.limit(1)
					.maybeSingle();
			if (supplierLookupError) throw supplierLookupError;

			let supplierId = existingSupplier?.id as string | undefined;
			if (!supplierId) {
				const { data, error } = await supabase
					.from("suppliers")
					.insert({
						name: product.supplierName,
						website_url: `https://${process.env.SHOPIFY_STORE_DOMAIN ?? "ponyo-plushies.myshopify.com"}`,
					})
					.select("id")
					.single();
				if (error) throw error;
				supplierId = data.id as string;
			}

			const categoryName = product.categoryName;
			const categorySlug = slugify(categoryName);
			const { data: category, error: categoryError } = await supabase
				.from("categories")
				.upsert(
					{ name: categoryName, slug: categorySlug },
					{ onConflict: "slug" },
				)
				.select("id")
				.single();
			if (categoryError) throw categoryError;

			const { data: savedProduct, error: productError } = await supabase
				.from("products")
				.upsert(
					{
						slug: product.slug,
						sku: product.sku,
						name: product.name,
						description: product.description,
						published_at: record.published_at ?? null,
						supplier_id: supplierId,
						category_id: category.id,
						price_amount: product.priceAmount,
						compare_at_amount: product.compareAtAmount ?? null,
						currency: product.currency,
						availability: product.availability,
						availability_status: product.availabilityStatus ?? "Available",
						size_tier: product.sizeTier ?? null,
						dimensions: product.dimensions ?? null,
						dispatch_time: product.dispatchTime ?? null,
						published: true,
						shopify_product_id: product.shopifyProductId,
						shopify_variant_id: Number(product.variantId),
						product_type: product.productType,
						tags: product.tags,
					},
					{ onConflict: "slug" },
				)
				.select("id")
				.single();
			if (productError) throw productError;

			const imageUrl =
				typeof product.image === "string" ? product.image : product.image.src;
			const { data: existingImage, error: imageLookupError } = await supabase
				.from("product_images")
				.select("id")
				.eq("product_id", savedProduct.id)
				.limit(1)
				.maybeSingle();
			if (imageLookupError) throw imageLookupError;

			const imageRecord = {
				image_url: imageUrl,
				alt_text: product.imageAlt,
				sort_order: 0,
			};
			const imageResult = existingImage
				? await supabase
						.from("product_images")
						.update(imageRecord)
						.eq("id", existingImage.id)
				: await supabase
						.from("product_images")
						.insert({ ...imageRecord, product_id: savedProduct.id });
			if (imageResult.error) throw imageResult.error;
			synced += 1;
		}

		return NextResponse.json({ synced, source: "shopify" });
	} catch (error) {
		console.error("Shopify catalog sync failed.", error);
		return NextResponse.json(
			{ error: "Catalog sync failed." },
			{ status: 502 },
		);
	}
}
