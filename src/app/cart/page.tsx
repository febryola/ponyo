import Link from "next/link";
import { SiteFrame } from "@/components/layout/site-frame";

export const metadata = { title: "Keranjang" };

export default function CartPage() {
  return (
    <SiteFrame>
      <div className="page-intro"><p className="eyebrow">Your little bundle</p><h1 className="page-title">Keranjang</h1></div>
      <section className="notice-panel">
        <span className="status-chip">Tahap fondasi MVP</span>
        <h2 className="product-name">Keranjang belum diaktifkan</h2>
        <p>Produk di katalog masih berupa contoh. Keranjang, konfirmasi supplier, dan checkout akan dibangun setelah keputusan alur pembayaran disepakati.</p>
        <Link className="button button-dark" href="/shop">Kembali ke koleksi <span aria-hidden="true">↗</span></Link>
      </section>
    </SiteFrame>
  );
}
