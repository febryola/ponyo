import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SiteFrame } from "@/components/layout/site-frame";
import { formatPrice } from "@/lib/utils/format-price";
import { getProductBySlug } from "@/services/product.service";

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  return (
    <SiteFrame>
      <p className="eyebrow"><Link href="/shop">← Kembali ke koleksi</Link></p>
      <div className="detail-layout">
        <div className={`detail-art product-art-${product.artTone}`}>
          <Image src={product.image} alt={product.imageAlt} fill sizes="(max-width: 760px) 100vw, 50vw" />
        </div>
        <div className="detail-copy">
          <p className="eyebrow">{product.categoryName}</p>
          <h1 className="page-title">{product.name}</h1>
          <p className="product-category">{product.supplierName}</p>
          <p className="product-price">{formatPrice(product.priceAmount, product.currency)}</p>
          <p className="page-description">{product.description}</p>
          <div className="availability-note">
            {product.availability === "available"
              ? "Supplier menyatakan produk tersedia. Kami akan mengonfirmasi kembali saat pesanan diteruskan."
              : "Ketersediaan perlu dikonfirmasi kepada supplier sebelum pesanan dapat diproses."}
          </div>
          <Link className="button button-dark" href="/cart">Lanjut ke keranjang <span aria-hidden="true">↗</span></Link>
          <p className="page-description">Checkout dan pembayaran belum diaktifkan. Ini adalah fondasi katalog MVP.</p>
        </div>
      </div>
    </SiteFrame>
  );
}
