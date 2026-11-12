/** Reviewed profile dashboard copy for the five supported storefront locales. */
const rows: ReadonlyArray<readonly [string, string, string, string, string, string]> = [
  ["orders_kicker", "TUS PEDIDOS", "PESANANMU", "ご注文", "주문 내역", "你的订单"],
  ["orders_title", "Pedidos y seguimiento", "Pesanan & pelacakan", "注文・配送状況", "주문 및 배송 조회", "订单与物流"],
  ["orders_unavailable", "Consulta las novedades de tus pedidos", "Lihat kabar terbaru pesananmu", "注文の最新情報を確認", "최신 주문 소식 확인하기", "查看订单最新动态"],
  ["order_count_one", "1 pedido hasta ahora", "1 pesanan sejauh ini", "注文は1件", "주문 1건", "目前有 1 笔订单"],
  ["order_count_many", "{{count}} pedidos hasta ahora", "{{count}} pesanan sejauh ini", "注文 {{count}} 件", "주문 {{count}}건", "目前有 {{count}} 笔订单"],
  ["shop_kicker", "UN PEQUEÑO CAPRICHO", "TEMUKAN YANG BARU", "次のお気に入りを探そう", "새로운 마음의 친구", "发现新的心头好"],
  ["shop_title", "Volver a la tienda", "Belanja lagi", "もう一度お買い物", "다시 쇼핑하기", "继续逛逛"],
  ["shop_body", "Encuentra tu próximo peluche favorito", "Temukan boneka favorit berikutnya", "次のお気に入りを見つけましょう", "다음으로 좋아할 인형을 만나 보세요", "寻找下一只心爱毛绒"],
  ["help_kicker", "ESTAMOS CONTIGO", "KAMI SIAP MEMBANTU", "いつでもご相談ください", "언제든 도와드릴게요", "我们随时为你提供帮助"],
  ["returns_title", "Devoluciones y ayuda con pedidos", "Bantuan retur & pesanan", "返品・注文に関するお問い合わせ", "반품 및 주문 도움", "退货与订单帮助"],
  ["returns_body", "Contacta con Ponyo sobre una devolución o un problema con tu pedido", "Hubungi Ponyo tentang retur atau kendala pesanan", "返品や注文のお困りごとはPonyoへご連絡ください", "반품 또는 주문 문제는 Ponyo에 문의해 주세요", "如需退货或订单协助，请联系 Ponyo"],
  ["reorder_kicker", "UN FAVORITO DE TU PEDIDO", "FAVORIT DARI PESANANMU", "前回のお気に入り", "지난 주문의 마음에 든 상품", "再次选购心仪商品"],
  ["reorder_title", "Volver a comprar", "Beli lagi", "もう一度購入", "다시 구매하기", "再次购买"],
  ["reorder_body", "Añade artículos de tu último pedido con los precios actuales verificados", "Tambahkan item dari pesanan terakhir dengan harga terkini yang sudah diperiksa", "最新の価格と在庫を確認して、前回の商品をカートに追加", "현재 가격과 재고를 확인한 뒤 최근 주문 상품을 담아 보세요", "以已核实的当前价格，将最近订单商品加入购物车"],
  ["reorder_button", "Añadir al carrito", "Tambahkan ke keranjang", "カートに追加", "장바구니에 담기", "加入购物车"],
  ["reorder_checking", "Comprobando disponibilidad…", "Memeriksa ketersediaan…", "在庫を確認中…", "재고 확인 중…", "正在检查库存…"],
  ["reorder_unavailable", "Este pedido no tiene artículos disponibles para volver a comprar rápidamente. Contacta con Ponyo si necesitas ayuda.", "Item dari pesanan ini tidak tersedia untuk dibeli ulang dengan cepat. Hubungi Ponyo jika perlu bantuan.", "この注文には再購入できる商品がありません。サポートが必要な場合はPonyoへお問い合わせください。", "이 주문에는 바로 다시 구매할 수 있는 상품이 없어요. 도움이 필요하면 Ponyo에 문의해 주세요.", "此订单没有可快速再次购买的商品。如需帮助，请联系 Ponyo。"],
  ["reorder_review", "Algunos artículos no están disponibles o han cambiado de precio. Revisa tu pedido antes de añadirlos al carrito.", "Beberapa item tidak tersedia atau harganya berubah. Tinjau pesanan sebelum menambahkannya ke keranjang.", "在庫切れ、または価格が変更された商品があります。カートに追加する前に注文内容をご確認ください。", "일부 상품이 품절되었거나 가격이 변경되었어요. 장바구니에 담기 전에 주문을 확인해 주세요.", "部分商品已无库存或价格已变更。请先核对，再加入购物车。"],
  ["reorder_error", "No se pudo comprobar la disponibilidad actual. Inténtalo de nuevo o contacta con Ponyo.", "Ketersediaan terkini tidak dapat diperiksa. Coba lagi atau hubungi Ponyo.", "現在の在庫を確認できませんでした。もう一度お試しいただくか、Ponyoへお問い合わせください。", "현재 재고를 확인할 수 없어요. 다시 시도하거나 Ponyo에 문의해 주세요.", "无法检查当前库存。请重试或联系 Ponyo。"],
  ["reorder_cart_full", "Tu carrito está lleno. Quita un artículo antes de añadir este pedido.", "Keranjangmu penuh. Hapus satu item sebelum menambahkan pesanan ini.", "カートがいっぱいです。注文商品を追加する前に、商品を削除してください。", "장바구니가 가득 찼어요. 이 주문을 담기 전에 상품을 삭제해 주세요.", "购物车已满。请先移除商品，再添加此订单。"],
  ["reorder_contact", "Contactar con Ponyo", "Hubungi Ponyo", "Ponyoに問い合わせる", "Ponyo에 문의", "联系 Ponyo"],
];

export const accountTranslations: Record<string, Record<string, string>> = Object.fromEntries(
  ["es", "id", "ja", "ko", "zh-CN"].map((language, index) => [
    language,
    Object.fromEntries(rows.map(([key, ...values]) => [`account.${key}`, values[index]])),
  ]),
);
