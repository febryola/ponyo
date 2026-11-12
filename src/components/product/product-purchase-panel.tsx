"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocalization } from "@/components/layout/localization-provider";
import { saveWishlist, useWishlistHandles } from "@/lib/wishlist";
import type { CartItem } from "@/lib/cart";
import type { Product } from "@/types/product";

export function ProductPurchasePanel({ product }: { product: Product }) {
  const router = useRouter();
  const { formatPrice, t } = useLocalization();
  const productName = t(`product.names.${product.slug}`, product.name);
  const productDescription = t(`product.descriptions.${product.slug}`, product.description);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState(product.variantId ?? product.variants?.[0]?.id ?? "");
  const [shareMessage, setShareMessage] = useState("");
  const savedHandles = useWishlistHandles();
  const saved = savedHandles.includes(product.slug);
  const selectedVariant = product.variants?.find((variant) => variant.id === selectedVariantId) ?? product.variants?.[0];
  const price = selectedVariant?.priceAmount ?? product.priceAmount;
  const currency = selectedVariant?.currency ?? product.currency;
  const compareAtAmount = selectedVariant?.compareAtAmount ?? product.compareAtAmount;
  const availability = selectedVariant?.availability ?? product.availability;
  const sku = selectedVariant?.sku ?? product.sku;
  const optionGroups = Object.entries(product.variants?.reduce<Record<string, string[]>>((groups, variant) => {
    for (const [name, value] of Object.entries(variant.options ?? {})) {
      const current = groups[name] ?? [];
      if (value && !current.includes(value)) groups[name] = [...current, value];
    }
    return groups;
  }, {}) ?? {});
  if (!optionGroups.some(([name]) => /color|colour/i.test(name)) && product.color) optionGroups.unshift(["Color", [product.color]]);
  const displaySize = product.size ?? [product.sizeTier, product.dimensions].filter(Boolean).join(" · ");
  if (!optionGroups.some(([name]) => /size/i.test(name)) && displaySize) optionGroups.push(["Size", [displaySize]]);
  const productHasVariantOption = (name: string, value: string) => product.variants?.some((variant) => variant.options?.[name] === value) ?? false;

  function toggleWishlist() {
    const next = saved ? savedHandles.filter((slug) => slug !== product.slug) : [product.slug, ...savedHandles];
    saveWishlist(next);
  }

  function makeCartItem(): CartItem {
    const image = typeof product.image === "string" ? product.image : product.image.src;
    return {
        id: selectedVariant?.id ?? product.variantId ?? product.id,
        catalogId: product.id,
        variantId: selectedVariant?.id ?? product.variantId,
        slug: product.slug,
        name: productName,
        maker: product.supplierName,
        price,
        currency,
        image,
        imageAlt: product.imageAlt,
        qty: quantity,
      };
  }

  function addToCart() {
    const item = makeCartItem();
    window.dispatchEvent(new CustomEvent("ponyo:add-to-cart", { detail: item }));
  }

  function buyNow() {
    if (waitlistEligible) return;
    const item = makeCartItem();
    try {
      window.sessionStorage.setItem("ponyo:buy-now-item", JSON.stringify(item));
    } catch {
      // The cart remains usable if session storage is disabled.
    }
    router.push("/checkout?buyNow=1");
  }

  function scrollToWaitlist(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const target = document.getElementById("product-waitlist");
    if (!target) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", "#product-waitlist");
  }

  async function shareProduct() {
    setShareMessage("");
    const shareData = { title: productName, text: productDescription, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        setShareMessage(t("product.share.copied", "Product link copied."));
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(shareData.url);
        setShareMessage("Product link copied.");
      } catch {
        setShareMessage(t("product.share.copy_fallback", "Copy this page link to share this plush."));
      }
    }
  }

  function selectOption(optionName: string, value: string) {
    const options = Object.fromEntries(optionGroups.map(([name]) => [name, name === optionName ? value : selectedVariant?.options?.[name]]));
    const match = product.variants?.find((variant) => Object.entries(options).every(([name, selected]) => !selected || variant.options?.[name] === selected));
    if (match) setSelectedVariantId(match.id);
  }

  const waitingStatuses = ["Coming Soon", "Waitlist", "Unavailable"];
  const waitlistEligible = availability === "unavailable" || waitingStatuses.includes(product.availabilityStatus ?? "");
  const statusLabel = product.availabilityStatus === "Coming Soon"
    ? t("product.status.coming_soon", "Coming soon")
    : product.availabilityStatus === "Waitlist"
      ? t("product.status.waitlist", "Join waitlist")
      : waitlistEligible
        ? t("product.status.unavailable", "Currently unavailable")
        : t("product.status.available", "Available to order");

  return (
    <>
      <div className="product-purchase-panel">
        <div className="product-status-badges"><p className={`product-availability${waitlistEligible ? " is-muted" : ""}`}><span />{statusLabel}</p>{product.tags?.includes("rare") && <span className="product-rarity">{t("product.label.rare", "Rare")}</span>}</div>
        <div className="product-title-row"><div><h1>{productName}</h1></div><div className="product-heading-actions"><button className="product-share-button" type="button" onClick={() => void shareProduct()} aria-label={t("product.action.share", "Share this plush")}><ShareIcon /></button><button type="button" className={`product-save${saved ? " is-saved" : ""}`} aria-label={`${saved ? t("product.action.remove_saved", "Remove from") : t("product.action.save", "Save to")} wishlist`} aria-pressed={saved} onClick={toggleWishlist}>{saved ? "♥" : "♡"}</button></div></div>
        {shareMessage && <p className="product-share-message" role="status">{shareMessage}</p>}
        <p className="product-detail-price">{formatPrice(price, currency)}{compareAtAmount && <del>{formatPrice(compareAtAmount, currency)}</del>}</p>
        <p className="product-short-description">{productDescription}</p>
        {optionGroups.length > 0 ? <div className="product-option-fields">{optionGroups.map(([name, values]) => <fieldset className={`product-option-group${/color|colour/i.test(name) ? " is-color-option" : /size/i.test(name) ? " is-size-option" : ""}`} key={name}><legend>{/color|colour/i.test(name) ? t("product.options.color", "Color") : /size/i.test(name) ? t("product.options.size", "Size") : name}<span>{selectedVariant?.options?.[name] ?? values[0]}</span></legend><div className="product-option-values">{values.map((value) => {
          const isSelected = selectedVariant?.options?.[name] === value;
          const hasVariant = productHasVariantOption(name, value);
          const unavailable = hasVariant && !product.variants?.some((variant) => variant.availability !== "unavailable" && variant.options?.[name] === value);
          return <button key={value} type="button" className={`${isSelected || (!hasVariant && values.length === 1) ? "is-selected" : ""}${unavailable ? " is-unavailable" : ""}`} aria-pressed={isSelected || (!hasVariant && values.length === 1)} disabled={unavailable || !hasVariant && values.length === 1} onClick={() => selectOption(name, value)}>{/color|colour/i.test(name) && <span className="product-color-swatch" aria-hidden="true" data-color={value.toLowerCase()} />}{value}</button>;
        })}</div></fieldset>)}</div> : <div className="product-option-fields">{product.color && <fieldset className="product-option-group is-color-option"><legend>Color<span>{product.color}</span></legend><div className="product-option-values"><span className="product-option-current"><span className="product-color-swatch" data-color={product.color.toLowerCase()} aria-hidden="true" />{product.color}</span></div></fieldset>}{(product.size || product.sizeTier || product.dimensions) && <fieldset className="product-option-group is-size-option"><legend>Size<span>{product.size ?? [product.sizeTier, product.dimensions].filter(Boolean).join(" · ")}</span></legend><div className="product-option-values"><span className="product-option-current">{product.size ?? [product.sizeTier, product.dimensions].filter(Boolean).join(" · ")}</span></div></fieldset>}</div>}
  {product.dispatchTime && <p className="product-dispatch">↗ {product.dispatchTime}</p>}
  <div className="product-quantity"><span>{t("product.quantity", "Quantity")}</span><div><button type="button" aria-label={t("product.quantity_decrease", "Decrease quantity")} disabled={quantity <= 1} onClick={() => setQuantity((amount) => Math.max(1, amount - 1))}>−</button><span>{quantity}</span><button type="button" aria-label={t("product.quantity_increase", "Increase quantity")} disabled={quantity >= 99} onClick={() => setQuantity((amount) => Math.min(99, amount + 1))}>＋</button></div></div>
        {waitlistEligible ? <a className="shop-button product-add-button product-waitlist-cta" href="#product-waitlist" onClick={scrollToWaitlist}>{t("product.action.join_waitlist", "Join waitlist")} <span aria-hidden="true">→</span></a> : <div className="product-purchase-actions"><button className="shop-button product-add-button" type="button" onClick={addToCart}>{t("product.action.add_to_cart", "Add to cart")} <span>· {formatPrice(price, currency)}</span></button><button className="product-buy-now-button" type="button" onClick={buyNow}>{t("product.action.buy_now", "Buy now")} <span aria-hidden="true">→</span></button></div>}
        <p className="product-shipping-note">{waitlistEligible ? t("product.waitlist_note", "Join the waitlist and we’ll email you when this plush is available.") : t("product.shipping_note", "Shipping and taxes calculated at checkout.")}</p>
        <div className="product-trust"><span>♡ {t("product.trust.curated", "Thoughtfully selected")}</span><span>✦ {t("product.trust.ready", "Ready to be loved")}</span></div>
      </div>
      <div className="mobile-sticky-purchase"><Link href="/" className="product-home-shortcut" aria-label="Home"><span aria-hidden="true">⌂</span><small>Home</small></Link>{waitlistEligible ? <a className="shop-button product-add-button product-waitlist-cta" href="#product-waitlist" onClick={scrollToWaitlist}>Join waitlist <span aria-hidden="true">→</span></a> : <button className="shop-button product-add-button" type="button" onClick={addToCart}>Add to cart <span>· {formatPrice(price, currency)}</span></button>}</div>
      <div className="product-details-accordion">
        <details open><summary>{t("product.details.title", "Product details")}</summary><div><p>{productDescription}</p><dl><div><dt>{t("product.details.sku", "SKU")}</dt><dd>{sku}</dd></div><div><dt>{t("product.details.brand", "Brand")}</dt><dd>{product.supplierName}</dd></div><div><dt>{t("product.details.collection", "Collection")}</dt><dd>{t(`product.categories.${product.categoryName.toLowerCase().replaceAll(" ", "_")}`, product.categoryName)}</dd></div>{product.productType && <div><dt>{t("product.details.type", "Type")}</dt><dd>{product.productType}</dd></div>}{product.sizeTier && <div><dt>{t("product.details.size_tier", "Size tier")}</dt><dd>{product.sizeTier}</dd></div>}{product.size && <div><dt>{t("product.options.size", "Size")}</dt><dd>{product.size}</dd></div>}{product.dimensions && <div><dt>{t("product.details.dimensions", "Dimensions")}</dt><dd>{product.dimensions}</dd></div>}<div><dt>{t("product.details.availability", "Availability")}</dt><dd>{statusLabel}</dd></div>{product.dispatchTime && <div><dt>{t("product.details.dispatch", "Dispatch estimate")}</dt><dd>{product.dispatchTime}</dd></div>}</dl></div></details>
        <details><summary>{t("product.details.care_title", "Materials & care")}</summary><p>{t("product.details.care_body", "Specific material and care details haven’t been provided for this plush yet. Please follow the care label included with your item, or contact Ponyo before ordering if you need more information.")}</p></details>
        <details><summary>{t("product.details.delivery_title", "Delivery & checkout")}</summary><p>{product.dispatchTime ? `${t("product.details.dispatch_prefix", "Estimated dispatch:")} ${product.dispatchTime}. ` : t("product.details.dispatch_confirm", "Dispatch timing will be confirmed at checkout. ")}{t("product.details.delivery_body", "Shipping options and applicable taxes are calculated for your destination during checkout.")}</p></details>
      </div>
    </>
  );
}

function ShareIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m8.7 10.6 6.6-4.1M8.7 13.4l6.6 4.1" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>;
}
