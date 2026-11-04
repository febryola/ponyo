import { SiteFrame } from "@/components/layout/site-frame";

export const metadata = { title: "Pesanan" };

export default function OrdersPage() {
  return (
    <SiteFrame>
      <div className="page-intro"><p className="eyebrow">A little update</p><h1 className="page-title">Pesananmu</h1></div>
      <section className="notice-panel">
        <span className="status-chip">Belum tersedia</span>
        <h2 className="product-name">Pelacakan pesanan segera hadir</h2>
        <p>Riwayat pesanan dan status supplier akan tersedia setelah alur order MVP dihubungkan ke Supabase.</p>
      </section>
    </SiteFrame>
  );
}
