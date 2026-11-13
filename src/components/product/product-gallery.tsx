"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

export type ProductGalleryImage = { src: string; alt: string };

export function ProductGallery({ title, images }: { title: string; images: ProductGalleryImage[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [variantImages, setVariantImages] = useState<ProductGalleryImage[] | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const media = variantImages ?? images;
  const current = media[active];

  useEffect(() => {
    const onVariantChange = (event: Event) => {
      const detail = (event as CustomEvent<{ images?: ProductGalleryImage[] }>).detail;
      if (!detail?.images?.length) return;
      setVariantImages(detail.images);
      setActive(0);
      trackRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    };
    window.addEventListener("ponyo:product-variant-change", onVariantChange);
    return () => window.removeEventListener("ponyo:product-variant-change", onVariantChange);
  }, []);

  function openAt(index: number) {
    setActive(index);
    setZoomOpen(true);
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }

  function selectImage(index: number) {
    setActive(index);
    trackRef.current?.scrollTo({ left: index * trackRef.current.clientWidth, behavior: "smooth" });
  }

  const move = useCallback((direction: number) => {
    setActive((index) => (index + direction + media.length) % media.length);
  }, [media.length]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
    };
    dialog.addEventListener("keydown", onKey);
    return () => dialog.removeEventListener("keydown", onKey);
  }, [media.length, move]);

  return <>
    <div className="product-gallery">
      <div ref={trackRef} className="product-gallery-track" role="region" aria-label={`${title} photos`} onScroll={(event) => {
        const element = event.currentTarget;
        const index = Math.round(element.scrollLeft / Math.max(1, element.clientWidth));
        setActive(Math.min(index, media.length - 1));
      }}>
        {media.map((image, index) => <div className="product-gallery-slide" key={`${image.src}-${index}`}><button type="button" className="product-gallery-zoom" aria-label={`View image: ${image.alt || title}`} onClick={() => openAt(index)}><Image src={image.src} alt={image.alt || title} fill priority={index === 0} sizes="(min-width: 1280px) 480px, (min-width: 1024px) 440px, (min-width: 768px) 42vw, calc(100vw - 34px)" /></button></div>)}
      </div>
      <span className="product-gallery-count" aria-live="polite">{active + 1} / {media.length}</span>
      {media.length > 1 && <div className="product-gallery-thumbnails" role="group" aria-label="Choose product image">{media.map((image, index) => <button key={`${image.src}-thumb`} type="button" aria-label={`Show image ${index + 1}`} aria-pressed={active === index} onClick={() => selectImage(index)}><Image src={image.src} alt="" width={64} height={64} /></button>)}</div>}
      <p className="product-image-caption"><span>♡</span> A new forever friend</p>
    </div>
    <dialog ref={dialogRef} className="product-zoom-dialog" aria-label={`${title} image viewer`} onClose={() => setZoomOpen(false)} onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close(); }}>
      <div className="product-zoom-viewer">
        <button className="product-zoom-close" type="button" aria-label="Close image" onClick={() => dialogRef.current?.close()}>×</button>
        {zoomOpen && current && <Image src={current.src} alt={current.alt || title} fill sizes="100vw" priority />}
        {media.length > 1 && <><button className="product-zoom-prev" type="button" aria-label="Previous image" onClick={() => move(-1)}>‹</button><button className="product-zoom-next" type="button" aria-label="Next image" onClick={() => move(1)}>›</button><span className="product-zoom-count">{active + 1} / {media.length}</span></>}
      </div>
    </dialog>
  </>;
}
