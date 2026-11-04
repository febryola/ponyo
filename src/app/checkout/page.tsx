import Link from "next/link";
import { SiteFrame } from "@/components/layout/site-frame";

export const metadata = { title: "Checkout" };

export default function CheckoutPage() {
  return (
    <SiteFrame>
      <div className="page-intro"><p className="eyebrow">Almost there</p><h1 className="page-title">Checkout</h1></div>
      <section className="notice-panel">
        <span className="status-chip">Menunggu keputusan</span>
        <h2 className="product-name">Bagaimana pembayaran akan dilakukan?</h2>
        <p>Sebelum checkout dibuat, Ponyo perlu menyepakati apakah pelanggan membayar Ponyo atau membayar langsung ke supplier. Keputusan ini memengaruhi pembayaran, refund, dan status pesanan.</p>
        <Link className="button button-dark" href="/shop">Lihat katalog <span aria-hidden="true">↗</span></Link>
      </section>
    </SiteFrame>
  );
}
