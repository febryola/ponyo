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
  const { formatPrice } = useLocalization();
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
        id: product.id,
        catalogId: product.id,
        variantId: selectedVariant?.id ?? product.variantId,
        slug: product.slug,
        name: product.name,
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

  async function shareProduct() {
    setShareMessage("");
    const shareData = { title: product.name, text: product.description, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        setShareMessage("Product link copied.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(shareData.url);
        setShareMessage("Product link copied.");
      } catch {
        setShareMessage("Copy this page link to share this plush.");
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
    ? "Coming soon"
    : product.availabilityStatus === "Waitlist"
      ? "Join waitlist"
      : waitlistEligible
        ? "Currently unavailable"
        : "Available to order";

  return (
    <>
      <div className="product-purchase-panel">
        <div className="product-status-badges"><p className={`product-availability${waitlistEligible ? " is-muted" : ""}`}><span />{statusLabel}</p>{product.tags?.includes("rare") && <span className="product-rarity">Rare</span>}</div>
        <div className="product-title-row"><div><h1>{product.name}</h1></div><div className="product-heading-actions"><button className="product-share-button" type="button" onClick={() => void shareProduct()} aria-label="Share this plush"><ShareIcon /></button><button type="button" className={`product-save${saved ? " is-saved" : ""}`} aria-label={`${saved ? "Remove from" : "Save to"} wishlist`} aria-pressed={saved} onClick={toggleWishlist}>{saved ? "♥" : "♡"}</button></div></div>
        {shareMessage && <p className="product-share-message" role="status">{shareMessage}</p>}
        <p className="product-detail-price">{formatPrice(price, currency)}{compareAtAmount && <del>{formatPrice(compareAtAmount, currency)}</del>}</p>
        <p className="product-short-description">{product.description}</p>
        {optionGroups.length > 0 ? <div className="product-option-fields">{optionGroups.map(([name, values]) => <fieldset className={`product-option-group${/color|colour/i.test(name) ? " is-color-option" : /size/i.test(name) ? " is-size-option" : ""}`} key={name}><legend>{name}<span>{selectedVariant?.options?.[name] ?? values[0]}</span></legend><div className="product-option-values">{values.map((value) => {
          const isSelected = selectedVariant?.options?.[name] === value;
          const hasVariant = productHasVariantOption(name, value);
          const unavailable = hasVariant && !product.variants?.some((variant) => variant.availability !== "unavailable" && variant.options?.[name] === value);
          return <button key={value} type="button" className={`${isSelected || (!hasVariant && values.length === 1) ? "is-selected" : ""}${unavailable ? " is-unavailable" : ""}`} aria-pressed={isSelected || (!hasVariant && values.length === 1)} disabled={unavailable || !hasVariant && values.length === 1} onClick={() => selectOption(name, value)}>{/color|colour/i.test(name) && <span className="product-color-swatch" aria-hidden="true" data-color={value.toLowerCase()} />}{value}</button>;
        })}</div></fieldset>)}</div> : <div className="product-option-fields">{product.color && <fieldset className="product-option-group is-color-option"><legend>Color<span>{product.color}</span></legend><div className="product-option-values"><span className="product-option-current"><span className="product-color-swatch" data-color={product.color.toLowerCase()} aria-hidden="true" />{product.color}</span></div></fieldset>}{(product.size || product.sizeTier || product.dimensions) && <fieldset className="product-option-group is-size-option"><legend>Size<span>{product.size ?? [product.sizeTier, product.dimensions].filter(Boolean).join(" · ")}</span></legend><div className="product-option-values"><span className="product-option-current">{product.size ?? [product.sizeTier, product.dimensions].filter(Boolean).join(" · ")}</span></div></fieldset>}</div>}
        {product.dispatchTime && <p className="product-dispatch">↗ {product.dispatchTime}</p>}
        <div className="product-quantity"><span>Quantity</span><div><button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => setQuantity((amount) => Math.max(1, amount - 1))}>−</button><span>{quantity}</span><button type="button" aria-label="Increase quantity" onClick={() => setQuantity((amount) => amount + 1)}>＋</button></div></div>
        {waitlistEligible ? <a className="shop-button product-add-button product-waitlist-cta" href="#product-waitlist-title">Join waitlist <span aria-hidden="true">→</span></a> : <div className="product-purchase-actions"><button className="shop-button product-add-button" type="button" onClick={addToCart}>Add to cart <span>· {formatPrice(price, currency)}</span></button><button className="product-buy-now-button" type="button" onClick={buyNow}>Buy now <span aria-hidden="true">→</span></button></div>}
        <p className="product-shipping-note">{waitlistEligible ? "Join the waitlist and we’ll email you when this plush is available." : "Shipping and taxes calculated at checkout."}</p>
        <div className="product-trust"><span>♡ Thoughtfully selected</span><span>✦ Ready to be loved</span></div>
      </div>
      <div className="mobile-sticky-purchase"><Link href="/" className="product-home-shortcut" aria-label="Home"><span aria-hidden="true">⌂</span><small>Home</small></Link>{waitlistEligible ? <a className="shop-button product-add-button product-waitlist-cta" href="#product-waitlist-title">Join waitlist <span aria-hidden="true">→</span></a> : <button className="shop-button product-add-button" type="button" onClick={addToCart}>Add to cart <span>· {formatPrice(price, currency)}</span></button>}</div>
      <div className="product-details-accordion">
        <details open><summary>Product details</summary><div><p>{product.description}</p><dl><div><dt>SKU</dt><dd>{sku}</dd></div><div><dt>Brand</dt><dd>{product.supplierName}</dd></div><div><dt>Collection</dt><dd>{product.categoryName}</dd></div>{product.productType && <div><dt>Type</dt><dd>{product.productType}</dd></div>}{product.sizeTier && <div><dt>Size tier</dt><dd>{product.sizeTier}</dd></div>}{product.size && <div><dt>Size</dt><dd>{product.size}</dd></div>}{product.dimensions && <div><dt>Dimensions</dt><dd>{product.dimensions}</dd></div>}<div><dt>Availability</dt><dd>{statusLabel}</dd></div>{product.dispatchTime && <div><dt>Dispatch estimate</dt><dd>{product.dispatchTime}</dd></div>}</dl></div></details>
        <details><summary>Materials &amp; care</summary><p>Specific material and care details haven’t been provided for this plush yet. Please follow the care label included with your item, or <Link href="/pages/contact">contact Ponyo</Link> before ordering if you need more information.</p></details>
        <details><summary>Delivery &amp; checkout</summary><p>{product.dispatchTime ? `Estimated dispatch: ${product.dispatchTime}. ` : "Dispatch timing will be confirmed at checkout. "}Shipping options and applicable taxes are calculated for your destination during checkout.</p></details>
      </div>
    </>
  );
}

function ShareIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="6" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="18" cy="19" r="3" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m8.7 10.6 6.6-4.1M8.7 13.4l6.6 4.1" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>;
}
