// Ponyo — Marketplace Homepage interactions (wireframe prototype)

// ---------------------------------------------------------------------------
// Synthesized sound module — generates gentle chime/bubble sounds with the
// Web Audio API only (no external audio files needed). Sound stays off until
// the visitor explicitly opts in via the "Ocean sounds" toggle.
// ---------------------------------------------------------------------------
let audioCtx = null;
let ambientNodes = null;
let soundEnabled = false;

function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playChime(freqs, duration) {
  freqs = freqs || [880, 1175];
  duration = duration || 0.35;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.08);
    gain.gain.linearRampToValueAtTime(0.16, now + i * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.08);
    osc.stop(now + i * 0.08 + duration + 0.05);
  });
}

function playBubblePop() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(500, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);
  gain.gain.setValueAtTime(0.1, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}

function startAmbient() {
  const ctx = getAudioCtx();
  if (!ctx || ambientNodes) return;
  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.0001;
  masterGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.2);
  masterGain.connect(ctx.destination);

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  osc1.type = 'sine'; osc1.frequency.value = 110;
  osc2.type = 'sine'; osc2.frequency.value = 164.81;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 500;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.15;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 200;
  lfo.connect(lfoGain).connect(filter.frequency);
  osc1.connect(filter); osc2.connect(filter);
  filter.connect(masterGain);
  osc1.start(); osc2.start(); lfo.start();

  const bubbleInterval = setInterval(() => {
    if (Math.random() > 0.55) playBubblePop();
  }, 2200);

  ambientNodes = { osc1, osc2, lfo, masterGain, bubbleInterval };
}

function stopAmbient() {
  if (!ambientNodes || !audioCtx) return;
  const { osc1, osc2, lfo, masterGain, bubbleInterval } = ambientNodes;
  clearInterval(bubbleInterval);
  const now = audioCtx.currentTime;
  masterGain.gain.linearRampToValueAtTime(0.0001, now + 0.4);
  osc1.stop(now + 0.5); osc2.stop(now + 0.5); lfo.stop(now + 0.5);
  ambientNodes = null;
}

const USD_PER_YEN = 0.00674;
const CART_STORAGE_KEY = 'ponyo-cart-v1';
const LANGUAGE_STORAGE_KEY = 'ponyo-language-v2';
let currentLanguage = 'en';
const DEFAULT_CART = [
  { id: 'hoshi-cloud-bear', name: 'Hoshi Cloud Bear', maker: 'Mochi & Co. · Japan', price: 127, qty: 1, variant: 'Size: 40cm', supply: '✅ Ready to ship · 7–10 days', thumbClass: 'ph-bear', emoji: '🧸' },
  { id: 'haneul-bunny', name: 'Haneul Bunny', maker: 'Studio Haneul · South Korea', price: 120, qty: 1, variant: 'Size: 38cm', supply: '✅ Ready to ship · 5–8 days', thumbClass: 'ph-cherry-bunny', emoji: '🐰' }
];

const translations = {
  'Trend': 'Beranda', 'Shop': 'Belanja', 'Shop All': 'Belanja Semua', 'Rare Finds': 'Temuan Langka', 'Domina XL': 'Domina XL', 'Maker Profiles': 'Profil Perajin', 'Makers': 'Perajin', 'About': 'Tentang',
  'Shipping Destinations': 'Tujuan Pengiriman', 'Search for plushies...': 'Cari boneka...',
  'Account': 'Akun', 'Wishlist': 'Favorit', 'Bag': 'Tas', 'Your Bag': 'Tas Anda',
  'Subtotal': 'Subtotal', 'Checkout': 'Pembayaran', 'Your Bag ✦': 'Tas Anda ✦',
  'Continue Shopping': 'Lanjut Belanja', 'Order Summary': 'Ringkasan Pesanan',
  'Delivery Destination': 'Tujuan Pengiriman', 'Estimated shipping': 'Estimasi ongkir',
  'Estimated duties': 'Estimasi bea masuk', 'Total': 'Total',
  'Proceed to Checkout →': 'Lanjut ke Pembayaran →', 'Supported destinations only': 'Hanya tujuan terdukung',
  'We only accept orders we can reliably fulfill.': 'Kami menerima pesanan ke wilayah yang dapat kami layani.',
  'Secure checkout': 'Pembayaran aman', 'Encrypted payments, transparent pricing.': 'Pembayaran terenkripsi dengan harga transparan.',
  'Remove': 'Hapus', 'Increase quantity': 'Tambah jumlah', 'Decrease quantity': 'Kurangi jumlah',
  'Delivery': 'Pengiriman', 'Payment': 'Pembayaran', 'Confirmation': 'Konfirmasi',
  'Full Name': 'Nama Lengkap', 'Phone Number': 'Nomor Telepon', 'Street Address': 'Alamat Jalan',
  'City': 'Kota', 'Postal Code': 'Kode Pos', 'Country / Destination': 'Negara / Tujuan',
  'Payment Method': 'Metode Pembayaran', 'Credit / Debit Card': 'Kartu Kredit / Debit',
  'Card Number': 'Nomor Kartu', 'Expiry Date': 'Tanggal Kedaluwarsa',
  'Order Review': 'Tinjau Pesanan', 'Place Order →': 'Buat Pesanan →',
  'Estimated delivery: 7–12 days after dispatch, tracked door to door.': 'Perkiraan tiba: 7–12 hari setelah dikirim, dapat dilacak hingga tujuan.',
  'Add to cart': 'Tambah ke tas', 'Add to wishlist': 'Simpan ke favorit',
  'Explore Domina →': 'Jelajahi Domina →', 'Meet the Makers ✨': 'Kenali Perajin ✨',
  'Shop Our Collection →': 'Belanja Koleksi Kami →', 'View All →': 'Lihat Semua →',
  'Bears': 'Beruang', 'Bunnies': 'Kelinci', 'Cats': 'Kucing', 'Characters': 'Karakter',
  'Birds': 'Burung', 'Dinosaurs': 'Dinosaurus', 'Domina': 'Domina',
  'Featured Collection': 'Koleksi Pilihan', 'Meet the Makers': 'Kenali Perajin',
  'Our Story →': 'Kisah Kami →', 'Follow Us': 'Ikuti Kami', 'Subscribe': 'Berlangganan',
  'Your email address': 'Alamat email Anda', 'Ocean sounds': 'Suara lautan',
  'Sounds on': 'Suara aktif', 'Shipping & duties confirmed before checkout, per destination.': 'Ongkir dan bea masuk dikonfirmasi sebelum pembayaran sesuai tujuan.',
  'Shipping & duties are confirmed for your destination at checkout.': 'Ongkir dan bea masuk untuk tujuan Anda dikonfirmasi saat pembayaran.',
  'Calculated at checkout': 'Dihitung saat pembayaran', 'Japan': 'Jepang', 'South Korea': 'Korea Selatan',
  'Singapore': 'Singapura', 'Australia': 'Australia', 'United States': 'Amerika Serikat',
  'Shipping to Supported Destinations': 'Pengiriman ke Tujuan Terdukung',
  'Curated with Love': 'Dikurasi dengan Cinta', 'Shop by': 'Belanja berdasarkan',
  'Category': 'Kategori', 'Featured Collection': 'Koleksi Pilihan', 'Bestseller': 'Terlaris',
  'Limited': 'Terbatas', 'New Maker': 'Perajin Baru', 'Popular': 'Populer',
  'Meet All Our Makers': 'Kenali Semua Perajin', 'Our Vision & Mission': 'Visi & Misi Kami',
  'The Domina Collection': 'Koleksi Domina', 'Statement-Sized': 'Ukuran Istimewa',
  'Same Quality Bar': 'Standar Kualitas Sama', 'Confirmed Delivery': 'Pengiriman Terkonfirmasi',
  'Limited Runs': 'Produksi Terbatas', 'Worldwide Shipping': 'Pengiriman Internasional',
  'To supported destinations': 'Ke tujuan yang didukung', 'Shipping & duties confirmed before checkout, per destination.': 'Ongkir dan bea masuk dikonfirmasi sebelum pembayaran sesuai tujuan.',
  'Our Makers & Products': 'Perajin & Produk Kami', 'What currencies and payment methods do you accept?': 'Mata uang dan metode pembayaran apa yang diterima?',
  'All prices are displayed in US dollars (USD). We accept major credit cards, PayPal, and bank transfer. Shipping and any applicable duties are shown separately before you place your order.': 'Semua harga ditampilkan dalam dolar AS (USD). Kami menerima kartu kredit utama, PayPal, dan transfer bank. Ongkir serta bea yang berlaku ditampilkan terpisah sebelum pesanan dibuat.',
  'Vision & Mission': 'Visi & Misi', 'Become a Maker': 'Bergabung sebagai Perajin',
  'Careers': 'Karier', 'FAQ & Shipping': 'FAQ & Pengiriman', 'Returns & Refunds': 'Pengembalian & Pengembalian Dana',
  'Contact Us': 'Hubungi Kami', 'Privacy Policy': 'Kebijakan Privasi', 'Terms of Service': 'Ketentuan Layanan',
  'Shipping Policy': 'Kebijakan Pengiriman', 'Company': 'Perusahaan', 'Support': 'Bantuan',
  'All prices are displayed in US dollars (USD).': 'Semua harga ditampilkan dalam dolar AS (USD).',
  'Qty': 'Jumlah', 'Ready to ship': 'Siap dikirim',
  'Welcome to': 'Selamat datang di',
  'A curated online marketplace for the world\'s best premium soft toys, serving customers worldwide where delivery can be supported. ♡': 'Marketplace pilihan untuk boneka premium terbaik dari seluruh dunia, melayani pelanggan di wilayah yang dapat dijangkau. ♡',
  'A curated marketplace for the world\'s best premium soft toys — serving customers worldwide where delivery can be supported. ♡': 'Marketplace pilihan untuk boneka premium terbaik — melayani pelanggan di wilayah yang dapat dijangkau. ♡',
  'A dedicated line for extra-large plush — statement pieces built with the same craftsmanship bar, scaled up for the boldest collectors.': 'Koleksi khusus boneka ekstra besar — dibuat dengan standar keahlian yang sama, untuk para kolektor yang berani tampil beda.',
  'To become the marketplace for the world\'s best soft toys.': 'Menjadi marketplace untuk boneka terbaik di dunia.',
  'We make exceptional soft toys accessible through disciplined curation and a dependable buying experience — serving only destinations Ponyo can reliably fulfill.': 'Kami menghadirkan boneka istimewa melalui kurasi cermat dan pengalaman belanja tepercaya — hanya untuk wilayah yang dapat kami layani dengan baik.',
  'Stay in the loop!': 'Jangan ketinggalan kabar!',
  'Be first to shop when we launch near you!': 'Jadilah yang pertama berbelanja saat kami hadir di wilayah Anda!',
  'Worldwide Shipping': 'Pengiriman Internasional', 'Verified Supply': 'Pasokan Terverifikasi',
  'Curated Quality': 'Kualitas Terkurasi', 'Dedicated Support': 'Dukungan Khusus',
  'Only the best for you': 'Hanya yang terbaik untuk Anda', 'Confirmed before listing': 'Dikonfirmasi sebelum ditampilkan',
  'We\'re here to help': 'Kami siap membantu',
  'The curated plush marketplace': 'Marketplace plush pilihan',
  'Extraordinary Finds. Impossible to Ignore.': 'Temuan istimewa yang sulit diabaikan.',
  'Discover collectible soft toys from independent makers — thoughtfully curated for exceptional quality, character, and comfort.': 'Temukan boneka koleksi dari perajin independen — dikurasi dengan cermat untuk kualitas, karakter, dan kenyamanan istimewa.',
  'Independent makers': 'Perajin independen', 'Premium by design': 'Premium dalam setiap detail',
  'Thoughtful delivery': 'Pengiriman tepercaya',
  'A more considered kind of plush': 'Plush pilihan dengan pertimbangan cermat',
  'Extraordinary finds.': 'Temuan istimewa.',
  'Impossible to ignore.': 'Sulit untuk diabaikan.',
  'Discover premium, rare, and oversized plushies with character — chosen to make you stop, smile, and want one.': 'Temukan boneka premium, langka, dan berukuran besar dengan karakter — pilihan yang membuat Anda berhenti, tersenyum, dan ingin memilikinya.',
  'Shop the Collection': 'Belanja Koleksi',
  'Explore Domina XL': 'Jelajahi Domina XL',
  'A curated destination for plush worth discovering.': 'Destinasi pilihan untuk plush yang layak ditemukan.',
  'Make room for wonder.': 'Sediakan ruang untuk keajaiban.',
  'Find your': 'Temukan', 'kind of special': 'yang istimewa',
  'Giant & XL': 'Besar & XL', 'Premium Details': 'Detail Premium', 'New & Limited': 'Baru & Terbatas',
  'Bears & Bunnies': 'Beruang & Kelinci', 'Distinctive by design': 'Istimewa dalam desain',
  'Rare & hard-to-find': 'Langka & sulit ditemukan', 'PONYO SIGNATURE COLLECTION': 'KOLEKSI SIGNATURE PONYO',
  'Meet the plush you came for': 'Temukan plush yang kamu cari', 'Plush to love.': 'Plush untuk disayang.', 'Finds to keep.': 'Temuan untuk disimpan.',
  'Shop trending': 'Belanja yang populer', 'Shop all plush': 'Lihat semua plush', 'THE PLUSH EDIT': 'PILIHAN PLUSH', 'Find your new favorite.': 'Temukan favorit barumu.',
  'The ones catching your eye': 'Yang sedang menarik perhatian', 'Trending plush': 'Plush populer', 'Shop all →': 'Belanja semua →',
  'Explore the collection': 'Jelajahi koleksi', 'Plush to discover': 'Plush untuk ditemukan', 'More characters to meet': 'Karakter lainnya', 'More plush to explore': 'Jelajahi lebih banyak plush', 'Browse collection →': 'Jelajahi koleksi →', 'More plush': 'Plush lainnya',
  'Trending': 'Tren', 'Loved': 'Disukai', 'Standout': 'Pilihan istimewa', 'Just arrived': 'Baru tiba', 'Fresh from the plush shelf': 'Temuan plush terbaru',
  'See what’s new →': 'Lihat yang baru →', 'New': 'Baru', 'Soft bear': 'Beruang lembut', 'Bunny favorite': 'Kelinci favorit',
  'Character plush': 'Plush karakter', 'Puppy plush': 'Plush anak anjing', 'Cat plush': 'Plush kucing', 'Bunny plush': 'Plush kelinci',
  'Oversized plush made to take up space and steal the scene. Explore statement pieces in 60–120 cm sizes, with delivery details to review before checkout.': 'Plush ekstra besar yang hadir mencuri perhatian. Jelajahi pilihan berukuran 60–120 cm dan tinjau detail pengiriman sebelum pembayaran.',
  'Discover Domina XL →': 'Jelajahi Domina XL →', 'A plush with presence.': 'Plush yang penuh karakter.',
  'More to fall for': 'Lebih banyak pilihan istimewa', 'New & limited finds': 'Temuan baru & terbatas',
  'Explore all finds →': 'Jelajahi semua temuan →', 'THE COLLECTOR EDIT': 'PILIHAN KOLEKTOR',
  'Pieces with a little more personality.': 'Pilihan dengan karakter yang lebih kuat.',
  'Explore the edit →': 'Jelajahi pilihan →', 'FRESH FINDS': 'TEMUAN BARU',
  'Meet your next favorite.': 'Temukan favorit Anda berikutnya.', 'Shop new arrivals →': 'Belanja produk baru →',
  'SPECIAL EDITIONS': 'EDISI SPESIAL', 'Small details. Big feeling.': 'Detail kecil. Kesan besar.',
  'See what stands out →': 'Lihat yang istimewa →', 'A better way to discover': 'Cara lebih baik untuk menemukan',
  'Why shop at Ponyo?': 'Mengapa belanja di Ponyo?',
  'Find the plush first. Get the details you need to choose with confidence.': 'Temukan plush terlebih dahulu. Dapatkan detail untuk memilih dengan yakin.',
  'Hard-to-find discoveries': 'Temuan yang sulit ditemukan',
  'Explore distinctive plush you may not come across every day.': 'Jelajahi plush istimewa yang tidak mudah ditemukan setiap hari.',
  'Carefully considered': 'Dipilih dengan cermat',
  'Product details and craftsmanship help each piece stand on its own.': 'Detail produk dan pengerjaan membuat setiap pilihan tampil istimewa.',
  'Delivery details upfront': 'Detail pengiriman di awal',
  'Review destination-specific shipping and duties before checkout.': 'Tinjau ongkir dan bea sesuai tujuan sebelum pembayaran.',
  'Maker stories, when you want them': 'Cerita perajin, saat Anda ingin tahu',
  'Discover who made your find without getting in the way of shopping.': 'Kenali pembuat produk tanpa mengganggu pengalaman belanja.',
  'A little extra something': 'Sedikit keistimewaan',
  'For the one you can\'t stop thinking about.': 'Untuk plush yang terus terbayang.',
  'Meet plush with memorable silhouettes, joyful color, and details worth a closer look.': 'Temukan plush dengan siluet berkesan, warna ceria, dan detail yang layak dilihat lebih dekat.',
  'THE MOST-WANTED EDIT': 'PILIHAN YANG PALING DIINGINKAN',
  'Big enough to change the room. Discover oversized plush from 60–120 cm, with scale and delivery details made clear before you choose.': 'Cukup besar untuk mengubah suasana ruang. Temukan plush ekstra besar 60–120 cm dengan informasi ukuran dan pengiriman yang jelas.',
  'A signature Ponyo collection': 'Koleksi signature Ponyo',
  'The Domina XL collection': 'Koleksi Domina XL',
  'Journal': 'Jurnal', 'The Plush Journal': 'Jurnal Plush', 'A closer look at plush': 'Melihat plush lebih dekat',
  'Ideas, details, and little guides for finding, choosing, and caring for the plush you love.': 'Ide, detail, dan panduan singkat untuk menemukan, memilih, dan merawat plush kesayangan Anda.',
  'Explore the stories ↓': 'Jelajahi cerita ↓', 'Product notes': 'Catatan produk', 'Made for plush people': 'Untuk pencinta plush',
  'Browse plush →': 'Jelajahi plush →', 'SIZE & SPACE': 'UKURAN & RUANG', 'Choosing an XL plush for your space': 'Memilih plush XL untuk ruang Anda',
  'Think about height, footprint, and where your plush will live.': 'Pertimbangkan tinggi, luas tempat, dan lokasi plush Anda.', 'Read the guide →': 'Baca panduan →',
  'LOOK CLOSER': 'LIHAT LEBIH DEKAT', 'The little details that make a plush': 'Detail kecil yang membuat plush istimewa',
  'A closer look at texture, shape, seams, and finishing.': 'Melihat lebih dekat tekstur, bentuk, jahitan, dan penyelesaian.', 'Explore the details →': 'Jelajahi detail →',
  'CARE NOTES': 'CATATAN PERAWATAN', 'Simple ways to care for a favorite': 'Cara sederhana merawat plush kesayangan',
  'Gentle, practical reminders for keeping plush looking its best.': 'Pengingat praktis dan lembut agar plush tetap terawat.',
  'Choosing an XL plush for your space': 'Memilih plush XL untuk ruang Anda', 'Size & space': 'Ukuran & ruang',
  'Start with the spot where your plush will sit. Measure the available height and floor or shelf space, then compare those dimensions with the product measurements. A lifestyle photo can help you imagine scale, but listed measurements are the best reference.': 'Mulailah dari tempat plush akan diletakkan. Ukur tinggi dan ruang lantai atau rak yang tersedia, lalu bandingkan dengan ukuran produk. Foto suasana dapat membantu membayangkan skalanya, tetapi ukuran yang tercantum adalah acuan terbaik.',
  'For a floor piece, leave room to walk around it and consider how it will look beside nearby furniture. For a bed or chair, check the width as well as the height so your plush feels at home without crowding the space.': 'Untuk plush di lantai, sisakan ruang untuk berjalan dan pertimbangkan tampilannya di samping furnitur. Untuk tempat tidur atau kursi, periksa lebar dan tingginya agar plush pas tanpa memenuhi ruang.',
  'Explore Domina XL →': 'Jelajahi Domina XL →', 'Look closer': 'Lihat lebih dekat',
  'Notice the overall silhouette first, then look at the details that give a plush its character: the pile and texture of the fabric, the placement of its features, and the way seams and trims are finished.': 'Perhatikan siluet keseluruhan, lalu detail yang membentuk karakter plush: tekstur kain, letak fitur wajah, serta penyelesaian jahitan dan trim.',
  'Product pages should make these details easy to understand with clear photos and straightforward descriptions. If a material, finish, or construction detail matters to you, check the listing for specifics rather than guessing from an image.': 'Halaman produk sebaiknya menjelaskan detail dengan foto yang jelas dan deskripsi lugas. Jika bahan, hasil akhir, atau konstruksi penting bagi Anda, periksa informasi produk daripada menebak dari gambar.',
  'Find a plush to love →': 'Temukan plush kesayangan →', 'Care notes': 'Catatan perawatan',
  'Care varies by fabric, filling, and construction, so start with the care instructions supplied with the specific product. When those instructions allow, spot-clean gently with a soft cloth and let the plush air-dry fully.': 'Perawatan bergantung pada kain, isian, dan konstruksi. Mulailah dengan instruksi perawatan produk tersebut. Jika diperbolehkan, bersihkan noda dengan lembut menggunakan kain halus dan biarkan plush benar-benar kering.',
  'Avoid machine washing or soaking unless the product’s care label explicitly says it is suitable. For oversized plush, check that you have enough room to clean and dry it safely before bringing it home.': 'Hindari mencuci dengan mesin atau merendam kecuali label perawatan menyatakannya aman. Untuk plush berukuran besar, pastikan tersedia ruang untuk membersihkan dan mengeringkannya dengan aman.',
  'Browse the collection →': 'Jelajahi koleksi →', 'Explore': 'Jelajahi', 'The Plush Journal': 'Jurnal Plush', 'About Ponyo': 'Tentang Ponyo', 'A curated destination for plush with personality.': 'Destinasi pilihan untuk plush berkarakter.',
  'Little plush notes, occasional new finds.': 'Catatan kecil tentang plush dan temuan baru sesekali.', 'New plush finds & notes': 'Temuan plush & catatan terbaru',
  'View all products': 'Lihat semua produk', 'More from ': 'Produk lain dari ', 'Shop more from ': 'Belanja produk dari ', 'Filters': 'Filter',
};
const japaneseTranslations = {
  'Trend': 'ホーム', 'Shop': 'ショップ', 'Shop All': 'すべての商品', 'Rare Finds': '希少なアイテム', 'Domina XL': 'ドミナ XL', 'Maker Profiles': '作り手紹介', 'Domina': 'ドミナ', 'Makers': '作り手', 'About': 'ポニョについて',
  'Shipping Destinations': '配送可能地域', 'Search for plushies...': 'ぬいぐるみを検索...',
  'Account': 'アカウント', 'Wishlist': 'お気に入り', 'Bag': 'カート', 'Your Bag': 'カート',
  'Subtotal': '小計', 'Checkout': 'レジに進む', 'Your Bag ✦': 'カート ✦',
  'Continue Shopping': '買い物を続ける', 'Order Summary': '注文概要', 'Delivery Destination': 'お届け先',
  'Estimated shipping': '送料（目安）', 'Estimated duties': '関税（目安）', 'Total': '合計',
  'Proceed to Checkout →': 'レジに進む →', 'Supported destinations only': '配送可能地域のみ',
  'We only accept orders we can reliably fulfill.': '確実にお届けできる地域のご注文のみ承ります。',
  'Secure checkout': '安全なお支払い', 'Encrypted payments, transparent pricing.': '暗号化された決済と明確な価格表示。',
  'Remove': '削除', 'Increase quantity': '数量を増やす', 'Decrease quantity': '数量を減らす',
  'Delivery': '配送', 'Payment': 'お支払い', 'Confirmation': '確認', 'Full Name': '氏名',
  'Phone Number': '電話番号', 'Street Address': '住所', 'City': '市区町村', 'Postal Code': '郵便番号',
  'Country / Destination': '国・地域', 'Payment Method': 'お支払い方法', 'Credit / Debit Card': 'クレジット／デビットカード',
  'Card Number': 'カード番号', 'Expiry Date': '有効期限', 'Order Review': '注文内容', 'Place Order →': '注文を確定 →',
  'Add to cart': 'カートに追加', 'Add to wishlist': 'お気に入りに追加', 'Explore Domina →': 'ドミナを見る →',
  'Meet the Makers ✨': '作り手に会う ✨', 'Shop Our Collection →': 'コレクションを見る →',
  'View All →': 'すべて見る →', 'Bears': 'くま', 'Bunnies': 'うさぎ', 'Cats': 'ねこ',
  'Characters': 'キャラクター', 'Birds': '鳥', 'Dinosaurs': '恐竜', 'Featured Collection': 'おすすめコレクション',
  'Meet the Makers': '作り手を知る', 'Our Story →': '私たちについて →', 'Follow Us': 'フォローする',
  'Subscribe': '登録する', 'Your email address': 'メールアドレス', 'Ocean sounds': '海の音', 'Sounds on': '音を再生中',
  'Calculated at checkout': 'お会計時に計算', 'Japan': '日本', 'South Korea': '韓国', 'Singapore': 'シンガポール',
  'Australia': 'オーストラリア', 'United States': 'アメリカ合衆国', 'Shipping to Supported Destinations': '配送可能地域へお届け',
  'Curated with Love': '心を込めてセレクト', 'Shop by': 'カテゴリーから探す', 'Category': 'カテゴリー',
  'Bestseller': '人気商品', 'Limited': '限定', 'New Maker': '新しい作り手', 'Popular': '人気',
  'Meet All Our Makers': 'すべての作り手を見る', 'Our Vision & Mission': 'ビジョンとミッション',
  'The Domina Collection': 'ドミナ コレクション', 'Statement-Sized': '存在感のあるサイズ',
  'Same Quality Bar': '変わらない品質基準', 'Confirmed Delivery': '配送を事前確認', 'Limited Runs': '数量限定',
  'Worldwide Shipping': '世界各地へ配送', 'To supported destinations': '配送可能地域へ', 'Vision & Mission': 'ビジョンとミッション',
  'Become a Maker': '作り手として参加', 'Careers': '採用情報', 'FAQ & Shipping': 'よくある質問・配送',
  'Returns & Refunds': '返品・返金', 'Contact Us': 'お問い合わせ', 'Privacy Policy': 'プライバシーポリシー',
  'Terms of Service': '利用規約', 'Shipping Policy': '配送ポリシー', 'Company': '会社情報', 'Support': 'サポート',
  'Qty': '数量', 'Ready to ship': '発送準備完了', 'Welcome to': 'ようこそ',
  'Stay in the loop!': '最新情報をお届けします', 'Be first to shop when we launch near you!': 'お近くでの販売開始をいち早くお知らせします！',
  'The Domina Collection': 'ドミナ コレクション', 'All prices are displayed in US dollars (USD).': '価格はすべて米ドル（USD）で表示されています。',
  'The curated plush marketplace': '上質なぬいぐるみのセレクトマーケット',
  'Extraordinary Finds. Impossible to Ignore.': '見逃せない、特別なぬいぐるみ。',
  'Discover collectible soft toys from independent makers — thoughtfully curated for exceptional quality, character, and comfort.': '独立した作り手によるコレクション向けぬいぐるみを、品質・個性・心地よさにこだわってセレクト。',
  'Independent makers': '独立した作り手', 'Premium by design': '細部まで上質', 'Thoughtful delivery': '安心のお届け',
  'A more considered kind of plush': 'こだわりのぬいぐるみをセレクト', 'Extraordinary finds.': '心に残る出会い。',
  'Impossible to ignore.': '見逃せない存在感。',
  'Discover premium, rare, and oversized plushies with character — chosen to make you stop, smile, and want one.': '個性あふれる上質で希少な大きなぬいぐるみ。思わず足を止め、笑顔になり、欲しくなる一品を。',
  'Shop the Collection': 'コレクションを見る', 'Explore Domina XL': 'ドミナ XLを見る',
  'A curated destination for plush worth discovering.': '出会う価値のあるぬいぐるみをセレクト。',
  'Make room for wonder.': 'ときめきを迎える場所を。', 'Find your': 'あなたらしい', 'kind of special': '特別を見つけよう',
  'Giant & XL': 'ビッグ＆XL', 'Premium Details': '上質なディテール', 'New & Limited': '新作＆限定',
  'Bears & Bunnies': 'くま＆うさぎ', 'Distinctive by design': 'デザインが際立つ',
  'Rare & hard-to-find': '希少なアイテム', 'PONYO SIGNATURE COLLECTION': 'PONYO シグネチャーコレクション',
  'Meet the plush you came for': '探していたぬいぐるみに出会おう', 'Plush to love.': '大好きなぬいぐるみ。', 'Finds to keep.': 'ずっと大切にしたい出会い。',
  'Shop trending': '人気アイテムを見る', 'Shop all plush': 'すべてのぬいぐるみ', 'THE PLUSH EDIT': 'ぬいぐるみセレクション', 'Find your new favorite.': '新しいお気に入りを見つけよう。',
  'The ones catching your eye': '注目のアイテム', 'Trending plush': '人気のぬいぐるみ', 'Shop all →': 'すべて見る →',
  'Explore the collection': 'コレクションを見る', 'Plush to discover': 'ぬいぐるみを探す', 'More characters to meet': 'もっとキャラクターを見る', 'More plush to explore': 'もっとぬいぐるみを見る', 'Browse collection →': 'コレクションを見る →', 'More plush': 'もっと見る',
  'Trending': 'トレンド', 'Loved': '人気', 'Standout': '注目', 'Just arrived': '新着アイテム', 'Fresh from the plush shelf': 'ぬいぐるみの新着',
  'See what’s new →': '新着を見る →', 'New': '新着', 'Soft bear': 'やわらかなくま', 'Bunny favorite': '人気のうさぎ',
  'Character plush': 'キャラクターぬいぐるみ', 'Puppy plush': '子犬のぬいぐるみ', 'Cat plush': 'ねこのぬいぐるみ', 'Bunny plush': 'うさぎのぬいぐるみ',
  'Oversized plush made to take up space and steal the scene. Explore statement pieces in 60–120 cm sizes, with delivery details to review before checkout.': '存在感たっぷりの大きなぬいぐるみ。60〜120cmのアイテムと配送情報をご覧ください。',
  'Discover Domina XL →': 'ドミナ XLを見る →', 'A plush with presence.': '存在感のあるぬいぐるみ。',
  'More to fall for': 'もっと見つけよう', 'New & limited finds': '新作＆限定アイテム',
  'Explore all finds →': 'すべて見る →', 'THE COLLECTOR EDIT': 'コレクターズセレクション',
  'Pieces with a little more personality.': '個性が光るアイテム。', 'Explore the edit →': 'セレクションを見る →',
  'FRESH FINDS': '新着アイテム', 'Meet your next favorite.': '次のお気に入りに出会う。',
  'Shop new arrivals →': '新着を見る →', 'SPECIAL EDITIONS': 'スペシャルエディション',
  'Small details. Big feeling.': '小さなディテール、大きなときめき。', 'See what stands out →': '注目アイテムを見る →',
  'A better way to discover': '新しい発見のかたち', 'Why shop at Ponyo?': 'Ponyoでお買い物する理由',
  'Find the plush first. Get the details you need to choose with confidence.': 'まずぬいぐるみと出会い、納得して選ぶための情報をご確認ください。',
  'Hard-to-find discoveries': '見つけにくいアイテム',
  'Explore distinctive plush you may not come across every day.': '日常ではなかなか出会えないぬいぐるみをご紹介。',
  'Carefully considered': '丁寧にセレクト',
  'Product details and craftsmanship help each piece stand on its own.': '商品の詳細とこだわりの仕上げをご紹介します。',
  'Delivery details upfront': '配送情報を事前に確認',
  'Review destination-specific shipping and duties before checkout.': 'お届け先ごとの送料や関税を決済前に確認できます。',
  'Maker stories, when you want them': '作り手のストーリーも',
  'Discover who made your find without getting in the way of shopping.': 'お買い物を楽しみながら、作り手について知ることもできます。',
  'A little extra something': '特別な何かを',
  'For the one you can\'t stop thinking about.': 'ずっと心に残る一品を。',
  'Meet plush with memorable silhouettes, joyful color, and details worth a closer look.': '印象的なシルエット、楽しい色合い、細部までご覧ください。',
  'THE MOST-WANTED EDIT': '注目のセレクション',
  'Big enough to change the room. Discover oversized plush from 60–120 cm, with scale and delivery details made clear before you choose.': 'お部屋の印象を変える大きなぬいぐるみ。60〜120cmのサイズと配送情報をご確認ください。',
  'A signature Ponyo collection': 'Ponyo シグネチャーコレクション',
  'The Domina XL collection': 'ドミナ XL コレクション',
  'Sample collection': 'サンプルコレクション',
  'Concept preview: product sizing, maker details, availability and shipping claims require confirmation before launch.': 'コンセプトプレビュー：商品サイズ、作り手、在庫、配送情報は公開前に確認が必要です。',
  'Journal': 'ジャーナル', 'The Plush Journal': 'ぬいぐるみジャーナル', 'A closer look at plush': 'ぬいぐるみをもっと知る',
  'Ideas, details, and little guides for finding, choosing, and caring for the plush you love.': 'お気に入りのぬいぐるみを見つけ、選び、お手入れするためのアイデアや小さなガイド。',
  'Explore the stories ↓': '記事を読む ↓', 'Product notes': 'ぬいぐるみのノート', 'Made for plush people': 'ぬいぐるみ好きのために',
  'Browse plush →': 'ぬいぐるみを見る →', 'SIZE & SPACE': 'サイズと空間', 'Choosing an XL plush for your space': 'お部屋に合うXLぬいぐるみの選び方',
  'Think about height, footprint, and where your plush will live.': '高さや設置面積、置く場所を考えてみましょう。', 'Read the guide →': 'ガイドを読む →',
  'LOOK CLOSER': '細部を見る', 'The little details that make a plush': 'ぬいぐるみを彩る小さなディテール',
  'A closer look at texture, shape, seams, and finishing.': '生地の質感、形、縫い目、仕上げを詳しく見てみましょう。', 'Explore the details →': 'ディテールを見る →',
  'CARE NOTES': 'お手入れメモ', 'Simple ways to care for a favorite': 'お気に入りを大切にする簡単なお手入れ',
  'Gentle, practical reminders for keeping plush looking its best.': 'きれいな状態を保つための、やさしく実用的なヒント。',
  'Size & space': 'サイズと空間',
  'Start with the spot where your plush will sit. Measure the available height and floor or shelf space, then compare those dimensions with the product measurements. A lifestyle photo can help you imagine scale, but listed measurements are the best reference.': 'まず、ぬいぐるみを置く場所を決めましょう。高さや床・棚のスペースを測り、商品サイズと比べてください。写真は大きさのイメージに役立ちますが、記載された寸法を基準にするのがおすすめです。',
  'For a floor piece, leave room to walk around it and consider how it will look beside nearby furniture. For a bed or chair, check the width as well as the height so your plush feels at home without crowding the space.': '床に置く場合は周囲に歩くスペースを残し、家具との見え方も考えましょう。ベッドや椅子に置く場合は、高さだけでなく幅も確認すると空間に無理なく収まります。',
  'Look closer': '細部を見る',
  'Notice the overall silhouette first, then look at the details that give a plush its character: the pile and texture of the fabric, the placement of its features, and the way seams and trims are finished.': 'まず全体のシルエットを見てから、生地の毛足や質感、顔のパーツの配置、縫い目やトリムの仕上げなど、個性を生む細部に注目しましょう。',
  'Product pages should make these details easy to understand with clear photos and straightforward descriptions. If a material, finish, or construction detail matters to you, check the listing for specifics rather than guessing from an image.': '商品ページでは、鮮明な写真とわかりやすい説明で詳細を確認しましょう。素材や仕上げ、構造が気になる場合は、画像から推測せず商品情報を確認してください。',
  'Care notes': 'お手入れメモ',
  'Care varies by fabric, filling, and construction, so start with the care instructions supplied with the specific product. When those instructions allow, spot-clean gently with a soft cloth and let the plush air-dry fully.': '生地や詰め物、構造によってお手入れ方法は異なるため、まず商品ごとの説明を確認してください。可能な場合は柔らかい布でやさしく部分洗いし、十分に自然乾燥させましょう。',
  'Avoid machine washing or soaking unless the product’s care label explicitly says it is suitable. For oversized plush, check that you have enough room to clean and dry it safely before bringing it home.': '洗濯表示で明記されていない限り、洗濯機やつけ置きは避けましょう。大きなぬいぐるみは、購入前に安全に洗って乾かせる場所があるか確認してください。',
  'Explore': '見てみる', 'About Ponyo': 'Ponyoについて', 'A curated destination for plush with personality.': '個性あふれるぬいぐるみをセレクトする場所。',
  'Little plush notes, occasional new finds.': 'ぬいぐるみの小さな読みものと、ときどき届く新しい出会い。', 'New plush finds & notes': '新しいぬいぐるみと読みもの',
  'View all products': 'すべての商品を見る', 'More from ': 'こちらの作り手の商品：', 'Shop more from ': '作り手の商品を見る：', 'Filters': '絞り込み'
};
const reverseTranslations = Object.fromEntries([...Object.entries(translations), ...Object.entries(japaneseTranslations)].map(([english, localized]) => [localized, english]));

function formatUSD(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(amount || 0));
}

function normalizeYenPrices() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.nodeValue.includes('¥')) continue;
    node.nodeValue = node.nodeValue.replace(/¥\s?([\d,]+)/g, (_, value) => formatUSD(Number(value.replace(/,/g, '')) * USD_PER_YEN));
  }
}

function setupMarketplaceMakerLinks() {
  document.querySelectorAll('a.product-card').forEach((cardLink) => {
    const productUrl = 'product.html';
    const card = document.createElement('article');
    card.className = cardLink.className;
    card.dataset.productUrl = productUrl;
    cardLink.replaceWith(card);
    while (cardLink.firstChild) card.appendChild(cardLink.firstChild);
    const productName = card.querySelector('.product-name');
    const productSlug = (productName?.textContent || 'plush').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const itemUrl = `${productUrl}?item=${encodeURIComponent(productSlug)}`;
    if (productName && !productName.querySelector('a')) {
      const productNameLink = document.createElement('a');
      productNameLink.className = 'product-name-link';
      productNameLink.href = itemUrl;
      productNameLink.textContent = productName.textContent.trim();
      productName.replaceChildren(productNameLink);
    }
    card.addEventListener('click', (event) => {
      if (event.target.closest('button, .product-maker-link')) return;
      const cardThumb = card.querySelector('.ph-thumb');
      const photo = card.querySelector('.product-photo, .ph-thumb img');
      const selectedProduct = {
        slug: productSlug,
        name: card.querySelector('.product-name')?.textContent.trim() || 'Plush item',
        maker: card.querySelector('.product-maker')?.textContent.trim() || '',
        size: card.querySelector('.product-size')?.textContent.trim() || card.querySelector('.product-name')?.textContent.match(/\d+\s?cm/i)?.[0] || card.querySelector('.product-name')?.textContent.match(/\bXL\b/i)?.[0] || '',
        description: card.querySelector('.product-reason')?.textContent.trim() || '',
        price: card.querySelector('.price')?.textContent.trim() || '',
        image: photo?.getAttribute('src') || '',
        imageAlt: photo?.getAttribute('alt') || '',
        visualClass: [...(cardThumb?.classList || [])].find((className) => className.startsWith('ph-') && className !== 'ph-thumb') || '',
        illustration: cardThumb?.querySelector('.plush-art')?.outerHTML || ''
      };
      try { sessionStorage.setItem('ponyo-selected-product-preview', JSON.stringify(selectedProduct)); } catch (error) { /* storage may be disabled */ }
      if (event.target.closest('a')) return;
      window.location.href = itemUrl;
    });
  });

  document.querySelectorAll('.product-card .product-maker').forEach((makerNode) => {
    const makerName = makerNode.textContent.trim().split('·')[0].trim();
    if (!makerName) return;
    makerNode.classList.add('product-maker-link');
    makerNode.setAttribute('role', 'link');
    makerNode.setAttribute('tabindex', '0');
    makerNode.setAttribute('aria-label', currentLanguage === 'id' ? `Belanja produk dari ${makerName}` : currentLanguage === 'jp' ? `作り手の商品を見る：${makerName}` : `Shop more from ${makerName}`);
    const goToMakerProducts = (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.location.href = `shop.html?maker=${encodeURIComponent(makerName)}`;
    };
    makerNode.addEventListener('click', goToMakerProducts);
    makerNode.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') goToMakerProducts(event);
    });
  });

  const makerQuery = new URLSearchParams(window.location.search).get('maker');
  if (!makerQuery || !document.querySelector('.shop-layout')) return;
  document.body.classList.add('maker-shop-mode');
  const makerName = makerQuery.trim();
  const pageTitle = document.querySelector('.page-banner h1');
  const pageSubtitle = document.querySelector('.page-banner-sub');
  const resultCount = document.querySelector('.result-count');
  const productCards = [...document.querySelectorAll('.shop-results .product-card')];
  let visibleCount = 0;
  productCards.forEach((card) => {
    const listedMaker = card.querySelector('.product-maker')?.textContent || '';
    const matchesMaker = listedMaker.toLowerCase().includes(makerName.toLowerCase());
    card.hidden = !matchesMaker;
    if (matchesMaker) visibleCount += 1;
  });
  if (pageTitle) pageTitle.textContent = currentLanguage === 'id' ? `Produk dari ${makerName}` : currentLanguage === 'jp' ? `${makerName}の商品` : `More from ${makerName}`;
  if (pageSubtitle) pageSubtitle.textContent = currentLanguage === 'id' ? `Jelajahi plush dari ${makerName} — pilih produk untuk melihat detailnya.` : currentLanguage === 'jp' ? `${makerName}が出品するぬいぐるみ。商品を選んで詳細をご覧ください。` : `Explore plush products listed by ${makerName} — select any item to see its details.`;
  if (resultCount) resultCount.textContent = currentLanguage === 'id' ? `${visibleCount} produk dari ${makerName}` : currentLanguage === 'jp' ? `${makerName}の商品 ${visibleCount}点` : `${visibleCount} ${visibleCount === 1 ? 'product' : 'products'} from ${makerName}`;
  const sortBar = document.querySelector('.sort-bar');
  if (sortBar) {
    const clearLink = document.createElement('a');
    clearLink.className = 'view-all maker-filter-clear';
    clearLink.href = 'shop.html';
    clearLink.textContent = currentLanguage === 'id' ? 'Lihat semua produk' : currentLanguage === 'jp' ? 'すべての商品を見る' : 'View all products';
    sortBar.prepend(clearLink);
  }
}

function setupProductPreview() {
  if (!document.querySelector('.product-detail')) return;
  const requestedSlug = new URLSearchParams(window.location.search).get('item');
  let selectedProduct;
  try { selectedProduct = JSON.parse(sessionStorage.getItem('ponyo-selected-product-preview') || 'null'); } catch (error) { selectedProduct = null; }
  if (!selectedProduct || !requestedSlug || selectedProduct.slug !== requestedSlug) return;

  const detail = document.querySelector('.product-detail');
  const title = detail.querySelector('.product-info-panel h1');
  const price = detail.querySelector('.price-lg');
  const description = detail.querySelector('.info-reason');
  const maker = detail.querySelector('.product-maker-lg');
  const image = detail.querySelector('.product-gallery-image');
  const breadcrumb = detail.parentElement.querySelector('.breadcrumb-current');
  const mainGallery = detail.querySelector('.gallery-main');
  if (title) title.textContent = selectedProduct.name;
  if (price && selectedProduct.price) price.textContent = selectedProduct.price;
  if (description && selectedProduct.description) description.textContent = selectedProduct.description;
  if (maker) maker.textContent = selectedProduct.maker || 'Independent maker';
  if (breadcrumb) breadcrumb.textContent = selectedProduct.name;
  const descriptionPanel = detail.querySelector('[data-panel="desc"] p');
  if (descriptionPanel && selectedProduct.description) descriptionPanel.textContent = selectedProduct.description;
  if (image && selectedProduct.image) {
    image.src = selectedProduct.image;
    image.alt = selectedProduct.imageAlt || selectedProduct.name;
    detail.querySelectorAll('.gallery-view-thumb img').forEach((thumbImage) => {
      thumbImage.src = selectedProduct.image;
    });
  } else if (image && selectedProduct.illustration && mainGallery) {
    const artworkHolder = document.createElement('div');
    artworkHolder.innerHTML = selectedProduct.illustration;
    const artwork = artworkHolder.querySelector('svg');
    if (artwork) {
      artwork.classList.add('product-gallery-illustration');
      artwork.setAttribute('role', 'img');
      artwork.setAttribute('aria-label', selectedProduct.name);
      artwork.removeAttribute('aria-hidden');
      mainGallery.classList.remove('ph-bear', 'ph-bunny', 'ph-cherry-bunny', 'ph-cat', 'ph-penguin', 'ph-fox', 'ph-elephant');
      if (/^ph-[a-z-]+$/.test(selectedProduct.visualClass)) mainGallery.classList.add(selectedProduct.visualClass);
      image.replaceWith(artwork);
      detail.querySelectorAll('.gallery-view-thumb').forEach((thumb) => {
        const thumbArtwork = artwork.cloneNode(true);
        thumbArtwork.removeAttribute('role');
        thumbArtwork.removeAttribute('aria-label');
        thumbArtwork.setAttribute('aria-hidden', 'true');
        thumb.replaceChildren(thumbArtwork);
      });
    } else {
      detail.querySelector('.gallery-view-controls')?.setAttribute('hidden', '');
    }
  } else if (image) {
    image.alt = selectedProduct.name;
    detail.querySelector('.gallery-view-controls')?.setAttribute('hidden', '');
  }
  const variantGroup = detail.querySelector('.variant-pills');
  if (variantGroup) {
    const sizeLabel = (selectedProduct.size || '').match(/\b(?:\d+\s?cm|XL)\b/i)?.[0];
    const sizeSection = variantGroup.closest('.variant-group');
    if (sizeLabel) {
      const sizeButton = document.createElement('button');
      sizeButton.className = 'variant-pill is-active';
      sizeButton.type = 'button';
      sizeButton.textContent = sizeLabel;
      variantGroup.replaceChildren(sizeButton);
      if (sizeSection) sizeSection.hidden = false;
    } else if (sizeSection) {
      sizeSection.hidden = true;
    }
  }
  document.title = `${selectedProduct.name} — Ponyo`;
}

function setupMarketplaceChrome() {
  const navItems = [
    ['Trend', 'index.html', 'index.html'],
    ['Shop All', 'shop.html', 'shop.html'],
    ['Rare Finds', 'index.html#rare-finds', 'rare-finds'],
    ['Domina XL', 'domina.html', 'domina.html'],
    ['Journal', 'journal.html', 'journal.html']
  ];
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  const desktopNav = document.querySelector('.main-nav');
  const mobileNav = document.getElementById('mobileNav');
  [desktopNav, mobileNav].forEach((nav) => {
    if (!nav) return;
    nav.replaceChildren(...navItems.map(([label, href, activeKey]) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      if ((activeKey === 'rare-finds' && window.location.hash === '#rare-finds') || (activeKey !== 'rare-finds' && currentPage === activeKey)) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }
      return link;
    }));
  });

  const siteHeader = document.querySelector('.site-header');
  if (siteHeader && mobileNav && !siteHeader.querySelector('.mobile-search-row')) {
    const searchForm = document.createElement('form');
    searchForm.className = 'mobile-search-row';
    searchForm.action = 'search.html';
    searchForm.method = 'get';
    searchForm.setAttribute('role', 'search');
    searchForm.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.2 15.2 4.8 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><input type="search" name="q" placeholder="Search plush..." aria-label="Search plush"/><button type="submit" aria-label="Submit search">Search</button>';
    mobileNav.insertAdjacentElement('beforebegin', searchForm);
  }

  document.querySelectorAll('.announce-bar p').forEach((announcement) => {
    const moon = document.createElement('span');
    moon.className = 'announce-moon';
    moon.setAttribute('aria-hidden', 'true');
    moon.innerHTML = '<svg viewBox="0 0 32 32"><path d="M24.8 21.4A12.6 12.6 0 0 1 10.6 7.2 12.8 12.8 0 1 0 24.8 21.4Z" fill="currentColor"/></svg>';
    const copy = document.createElement('span');
    copy.className = 'announcement-copy';
    copy.textContent = 'Extraordinary Finds. Impossible to Ignore.';
    const star = document.createElement('span');
    star.className = 'announce-star';
    star.setAttribute('aria-hidden', 'true');
    star.innerHTML = '<svg viewBox="0 0 32 32"><path d="M16 1.5 19.7 12l10.8 4-10.8 3.8L16 30.5l-3.8-10.7L1.5 16l10.7-4L16 1.5Z" fill="currentColor"/></svg>';
    announcement.replaceChildren(moon, copy, star);
  });

  document.querySelectorAll('.newsletter').forEach((newsletter) => {
    const bubble = newsletter.querySelector('.newsletter-mascot.left .speech-bubble');
    const heading = newsletter.querySelector('.newsletter-form-wrap h2');
    if (bubble) bubble.textContent = 'New plush finds & notes';
    if (heading && document.body.classList.contains('home-page')) heading.textContent = 'Get first dibs on new plush drops.';
    const socialIcons = {
      Instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="6.5" r="1.25" fill="currentColor"/></svg>',
      TikTok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11.2a4.2 4.2 0 1 1-3.1-4.05v3.2a1.2 1.2 0 1 0 .1.85V3h3c.25 2.45 1.55 4.1 4 4.55v3.1A8 8 0 0 1 14 9.1" fill="currentColor"/></svg>',
      YouTube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.7 15.4V8.6l6 3.4-6 3.4Z" fill="currentColor"/></svg>',
      Pinterest: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-3.65 19.31c-.03-.78-.01-1.72.19-2.57l1.37-5.8s-.34-.68-.34-1.68c0-1.57.91-2.75 2.04-2.75.96 0 1.42.72 1.42 1.58 0 .96-.61 2.4-.92 3.74-.26 1.12.56 2.03 1.66 2.03 1.99 0 3.53-2.1 3.53-5.13 0-2.68-1.93-4.55-4.69-4.55-3.19 0-5.07 2.39-5.07 4.86 0 .96.37 1.99.83 2.55.09.11.1.21.08.33l-.31 1.26c-.05.2-.16.24-.37.15-1.39-.65-2.26-2.68-2.26-4.32 0-3.52 2.56-6.75 7.38-6.75 3.87 0 6.88 2.76 6.88 6.45 0 3.85-2.43 6.95-5.81 6.95-1.14 0-2.21-.59-2.58-1.28l-.7 2.67c-.25.97-.94 2.19-1.4 2.93A10 10 0 1 0 12 2Z" fill="currentColor"/></svg>'
    };
    newsletter.querySelector('.social-label')?.remove();
    newsletter.querySelectorAll('.social-row a').forEach((link) => {
      const platform = link.getAttribute('aria-label');
      if (socialIcons[platform]) {
        link.classList.add('social-icon-link');
        link.innerHTML = socialIcons[platform];
      }
    });
  });

  document.querySelectorAll('.site-footer .footer-grid').forEach((footerGrid) => {
    const brand = footerGrid.querySelector('.footer-brand');
    if (!brand) return;
    const brandCopy = brand.querySelector('p');
    if (brandCopy) brandCopy.textContent = 'A curated collection of rare, premium, and distinctive plushies. ♡';
    footerGrid.querySelectorAll('.footer-col').forEach((column) => column.remove());

    const groups = [
      { title: 'Shop', links: [['Shop All', 'shop.html'], ['Rare Finds', 'index.html#rare-finds'], ['Domina XL', 'domina.html']] },
      { title: 'Explore', links: [['The Plush Journal', 'journal.html'], ['About Ponyo', 'about.html'], ['Become a Maker', 'become-a-maker.html']] },
      { title: 'Support', links: [['FAQ & Shipping', 'faq.html'], ['Returns & Refunds', 'faq.html#returns'], ['Contact Us', 'faq.html#contact']] }
    ];
    groups.forEach((group) => {
      const column = document.createElement('div');
      column.className = 'footer-col';
      const heading = document.createElement('h5');
      heading.textContent = group.title;
      column.appendChild(heading);
      group.links.forEach(([label, href]) => {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = label;
        column.appendChild(link);
      });
      footerGrid.appendChild(column);
    });
  });
}

function translatePage(language) {
  const table = language === 'id' ? translations : language === 'jp' ? japaneseTranslations : reverseTranslations;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const trimmed = node.nodeValue.trim();
    if (!trimmed) continue;
    Object.keys(table).sort((a, b) => b.length - a.length).forEach((phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      node.nodeValue = node.nodeValue.replace(new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, 'gu'), (_, prefix) => `${prefix}${table[phrase]}`);
    });
  }
  document.querySelectorAll('[aria-label], [placeholder], [title]').forEach((element) => {
    ['aria-label', 'placeholder', 'title'].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (value && table[value]) element.setAttribute(attribute, table[value]);
    });
  });
  document.documentElement.lang = language === 'id' ? 'id' : language === 'jp' ? 'ja' : 'en';
}

function setupLanguageSelector() {
  const headerActions = document.querySelector('.header-actions');
  const mobileNav = document.getElementById('mobileNav');
  if (!headerActions || !mobileNav) return;
  let language = 'en';
  try { language = localStorage.getItem(LANGUAGE_STORAGE_KEY) || 'en'; } catch (error) { /* storage may be disabled */ }
  if (!['en', 'id', 'jp'].includes(language)) language = 'en';
  currentLanguage = language;

  const languageControl = document.createElement('div');
  languageControl.className = 'language-control';
  languageControl.innerHTML = '<button class="language-globe" type="button" aria-label="Choose language" aria-expanded="false" aria-haspopup="true"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg></button><div class="language-menu" role="menu" aria-label="Choose language"><button type="button" role="menuitemradio" data-language="en">EN <span>English</span></button><button type="button" role="menuitemradio" data-language="id">ID <span>Bahasa Indonesia</span></button><button type="button" role="menuitemradio" data-language="jp">JP <span>日本語</span></button></div>';
  const globeButton = languageControl.querySelector('.language-globe');
  const languageMenu = languageControl.querySelector('.language-menu');
  const syncLanguageMenu = () => {
    languageMenu.querySelectorAll('[data-language]').forEach((option) => {
      option.setAttribute('aria-checked', String(option.dataset.language === language));
      option.classList.toggle('is-active', option.dataset.language === language);
    });
  };
  globeButton.addEventListener('click', () => {
    const isOpen = languageControl.classList.toggle('is-open');
    globeButton.setAttribute('aria-expanded', String(isOpen));
  });
  languageMenu.querySelectorAll('[data-language]').forEach((option) => {
    option.addEventListener('click', () => {
      language = option.dataset.language;
      currentLanguage = language;
      try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch (error) { /* storage may be disabled */ }
      languageControl.classList.remove('is-open');
      globeButton.setAttribute('aria-expanded', 'false');
      syncLanguageMenu();
      translatePage(language);
    });
  });
  document.addEventListener('click', (event) => {
    if (!languageControl.contains(event.target)) {
      languageControl.classList.remove('is-open');
      globeButton.setAttribute('aria-expanded', 'false');
    }
  });
  syncLanguageMenu();

  headerActions.appendChild(languageControl);
  translatePage(language);
}

document.addEventListener('DOMContentLoaded', () => {
  normalizeYenPrices();
  setupLanguageSelector();
  setupMarketplaceChrome();
  translatePage(currentLanguage);
  setupMarketplaceMakerLinks();
  setupProductPreview();

  const filterPanel = document.querySelector('.filter-panel');
  const filterToggle = filterPanel?.querySelector('.filter-toggle');
  const filterBreakpoint = window.matchMedia('(max-width: 860px)');
  const syncFilterDisclosure = () => {
    if (!filterPanel || !filterToggle) return;
    filterPanel.classList.toggle('is-collapsed', filterBreakpoint.matches);
    filterToggle.setAttribute('aria-expanded', String(!filterBreakpoint.matches));
  };
  if (filterPanel && filterToggle) {
    syncFilterDisclosure();
    filterToggle.addEventListener('click', () => {
      const isExpanded = filterToggle.getAttribute('aria-expanded') === 'true';
      filterToggle.setAttribute('aria-expanded', String(!isExpanded));
      filterPanel.classList.toggle('is-collapsed', isExpanded);
    });
    filterBreakpoint.addEventListener('change', syncFilterDisclosure);
  }
  // Ocean sounds toggle (homepage) — opt-in ambient pad + bubble blips
  const soundToggle = document.getElementById('soundToggle');
  if (soundToggle) {
    soundToggle.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundToggle.classList.toggle('is-active', soundEnabled);
      soundToggle.setAttribute('aria-pressed', String(soundEnabled));
      soundToggle.querySelector('.sound-icon').textContent = soundEnabled ? '🔊' : '🔈';
      soundToggle.querySelector('.sound-label').textContent = soundEnabled ? 'Sounds on' : 'Ocean sounds';
      if (soundEnabled) {
        playChime();
        startAmbient();
      } else {
        stopAmbient();
      }
    });
  }

  // Delightful little pop/chime on cute interactions (only once sound is on)
  document.querySelectorAll('.wish-btn, .wish-btn-lg').forEach((btn) => {
    btn.addEventListener('click', () => { if (soundEnabled) playChime([740, 1050], 0.22); });
  });
  document.querySelectorAll('.cart-btn, .quick-add, .qty-add-btn').forEach((btn) => {
    btn.addEventListener('click', () => { if (soundEnabled) playBubblePop(); });
  });

  // Search results page: reflect the ?q= query in the heading
  const searchHeading = document.getElementById('searchHeading');
  if (searchHeading) {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    if (query) {
      searchHeading.textContent = `Results for "${query}"`;
      const sub = document.getElementById('searchSub');
      if (sub) sub.textContent = `Showing items matching "${query}" — refine with the suggestions below.`;
      const input = document.getElementById('headerSearchInput');
      if (input) input.value = query;
    }
  }

  // Mobile nav toggle
  const menuToggle = document.getElementById('menuToggle');
  const mobileNav = document.getElementById('mobileNav');
  if (menuToggle && mobileNav) {
    menuToggle.addEventListener('click', () => {
      const isOpen = mobileNav.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
    });
    mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      mobileNav.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
    }));
  }

  // Bag drawer toggle
  const bagToggle = document.getElementById('bagToggle');
  const bagClose = document.getElementById('bagClose');
  const bagDrawer = document.getElementById('bagDrawer');
  const scrim = document.getElementById('scrim');

  const openBag = () => {
    bagDrawer.classList.add('is-open');
    scrim.classList.add('is-open');
  };
  const closeBag = () => {
    bagDrawer.classList.remove('is-open');
    scrim.classList.remove('is-open');
  };

  const thumbTemplates = new Map();
  document.querySelectorAll('.bag-item, .cart-row, .product-card, .review-item').forEach((source) => {
    const name = source.querySelector('.bag-item-name, .product-name, .cart-row-info .product-name, .review-item-name');
    const thumb = source.querySelector('.ph-thumb');
    if (name && thumb && !thumbTemplates.has(name.textContent.trim())) thumbTemplates.set(name.textContent.trim(), thumb.cloneNode(true));
  });

  let cartState;
  try {
    const savedCart = localStorage.getItem(CART_STORAGE_KEY);
    cartState = savedCart ? JSON.parse(savedCart) : DEFAULT_CART.map((item) => ({ ...item }));
  } catch (error) {
    cartState = DEFAULT_CART.map((item) => ({ ...item }));
  }
  if (!Array.isArray(cartState)) cartState = DEFAULT_CART.map((item) => ({ ...item }));

  const itemCount = () => cartState.reduce((count, item) => count + item.qty, 0);
  const cartSubtotal = () => cartState.reduce((sum, item) => sum + item.price * item.qty, 0);
  const saveCart = () => {
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartState)); } catch (error) { /* storage may be disabled */ }
  };
  const makeThumb = (item, sizeClass) => {
    const template = thumbTemplates.get(item.name);
    if (template) {
      const thumb = template.cloneNode(true);
      thumb.classList.remove('cart-thumb', 'cart-thumb-sm');
      thumb.classList.add(sizeClass);
      thumb.querySelectorAll('.badge, .wish-btn').forEach((decoration) => decoration.remove());
      return thumb;
    }
    const thumb = document.createElement('div');
    thumb.className = `ph-thumb ${item.thumbClass || 'ph-bear'} ${sizeClass}`;
    thumb.setAttribute('aria-hidden', 'true');
    thumb.textContent = item.emoji || '🧸';
    return thumb;
  };
  const makeStepper = (item, extraClass = '') => {
    const stepper = document.createElement('div');
    stepper.className = `qty-stepper ${extraClass}`.trim();
    stepper.dataset.cartManaged = 'true';
    stepper.innerHTML = `<button type="button" aria-label="Decrease quantity" data-cart-action="decrease" data-item-id="${item.id}">−</button><span>${item.qty}</span><button type="button" aria-label="Increase quantity" data-cart-action="increase" data-item-id="${item.id}">+</button>`;
    return stepper;
  };
  const makeRemoveButton = (item) => {
    const remove = document.createElement('button');
    remove.className = 'cart-remove'; remove.type = 'button';
    remove.dataset.cartAction = 'remove'; remove.dataset.itemId = item.id;
    remove.setAttribute('aria-label', 'Remove from bag');
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return remove;
  };
  const updateSummary = (summary, checkout = false) => {
    if (!summary) return;
    const rows = summary.querySelectorAll('.summary-row');
    const subtotal = cartSubtotal();
    if (rows[0]?.lastElementChild) rows[0].lastElementChild.textContent = formatUSD(subtotal);
    if (checkout) {
      if (rows[1]?.lastElementChild) rows[1].lastElementChild.textContent = formatUSD(cartState.length ? 16 : 0);
      if (rows[2]?.lastElementChild) rows[2].lastElementChild.textContent = formatUSD(cartState.length ? 7 : 0);
      if (rows[3]?.lastElementChild) rows[3].lastElementChild.textContent = formatUSD(subtotal + (cartState.length ? 23 : 0));
    } else {
      const totalRow = rows[rows.length - 1];
      if (totalRow?.lastElementChild) totalRow.lastElementChild.textContent = formatUSD(subtotal);
    }
  };
  const renderCart = () => {
    const count = itemCount();
    document.querySelectorAll('.bag-count').forEach((badge) => { badge.textContent = count; });
    const drawer = document.getElementById('bagDrawer');
    if (drawer) {
      const heading = drawer.querySelector('.bag-drawer-head h3 span');
      if (heading) heading.textContent = `(${count})`;
      const foot = drawer.querySelector('.bag-drawer-foot');
      drawer.querySelectorAll('.bag-item').forEach((item) => item.remove());
      cartState.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'bag-item';
        row.append(makeThumb(item, 'cart-thumb-sm'));
        const info = document.createElement('div');
        info.className = 'bag-item-info';
        const maker = document.createElement('p'); maker.className = 'bag-item-maker'; maker.textContent = item.maker;
        const name = document.createElement('p'); name.className = 'bag-item-name'; name.textContent = item.name;
        const price = document.createElement('p'); price.className = 'bag-item-price'; price.textContent = formatUSD(item.price * item.qty);
        const qtyRow = document.createElement('div'); qtyRow.className = 'cart-qty-row';
        qtyRow.append(makeStepper(item, 'drawer-qty'), makeRemoveButton(item));
        info.append(maker, name, price, qtyRow);
        row.append(info);
        drawer.insertBefore(row, foot);
      });
      const subtotal = drawer.querySelector('.bag-subtotal strong');
      if (subtotal) subtotal.textContent = formatUSD(cartSubtotal());
    }

    const cartList = document.querySelector('.cart-list');
    if (cartList) {
      cartList.querySelectorAll('.cart-row, .cart-empty').forEach((row) => row.remove());
      const continueLink = cartList.querySelector('.continue-shopping');
      cartState.forEach((item) => {
        const row = document.createElement('div'); row.className = 'cart-row'; row.dataset.itemId = item.id;
        row.append(makeThumb(item, 'cart-thumb'));
        const info = document.createElement('div'); info.className = 'cart-row-info';
        const maker = document.createElement('p'); maker.className = 'product-maker'; maker.textContent = item.maker;
        const name = document.createElement('h4'); name.className = 'product-name'; name.textContent = item.name;
        const variant = document.createElement('p'); variant.className = 'cart-variant'; variant.textContent = item.variant || 'Plush toy';
        const supply = document.createElement('p'); supply.className = 'cart-supply'; supply.textContent = item.supply || 'Made with care by an independent maker';
        info.append(maker, name, variant, supply);
        const price = document.createElement('p'); price.className = 'cart-row-price'; price.textContent = formatUSD(item.price * item.qty);
        const qtyWrap = document.createElement('div'); qtyWrap.className = 'cart-row-qty';
        qtyWrap.append(makeStepper(item, 'cart-qty'), makeRemoveButton(item));
        row.append(info, qtyWrap, price);
        cartList.insertBefore(row, continueLink);
      });
      if (!cartState.length) {
        const empty = document.createElement('p'); empty.className = 'cart-empty'; empty.textContent = 'Your bag is empty.';
        cartList.insertBefore(empty, continueLink);
      }
      updateSummary(document.querySelector('.cart-summary:not(.checkout-summary)'));
    }

    const checkoutSummary = document.querySelector('.checkout-summary');
    if (checkoutSummary) {
      checkoutSummary.querySelectorAll('.review-item').forEach((row) => row.remove());
      const firstSummary = checkoutSummary.querySelector('.summary-row');
      cartState.forEach((item) => {
        const row = document.createElement('div'); row.className = 'review-item';
        row.append(makeThumb(item, 'cart-thumb-sm'));
        const info = document.createElement('div');
        const name = document.createElement('p'); name.className = 'review-item-name'; name.textContent = item.name;
        const sub = document.createElement('p'); sub.className = 'review-item-sub'; sub.textContent = `${item.maker} · Qty ${item.qty}`;
        info.append(name, sub);
        const price = document.createElement('span'); price.className = 'review-item-price'; price.textContent = formatUSD(item.price * item.qty);
        row.append(info, price);
        checkoutSummary.insertBefore(row, firstSummary);
      });
      updateSummary(checkoutSummary, true);
    }
    translatePage(currentLanguage);
  };

  const addProductToCart = (button) => {
    const card = button.closest('.product-card');
    const detail = button.closest('.product-detail');
    const nameNode = card?.querySelector('.product-name') || detail?.querySelector('h1');
    const makerNode = card?.querySelector('.product-maker') || detail?.querySelector('.product-maker-lg') || document.querySelector('.maker-spotlight h3');
    const priceNode = card?.querySelector('.price') || detail?.querySelector('.price-lg');
    if (!nameNode || !priceNode) return;
    const name = nameNode.textContent.trim();
    const selectedSize = detail?.querySelector('.variant-pill.is-active')?.textContent.trim() || '';
    const id = `${name}-${selectedSize}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const price = Number((priceNode.textContent.match(/[\d,.]+/) || ['0'])[0].replace(/,/g, '')) || 0;
    const quantity = Math.max(1, Number.parseInt(detail?.querySelector('.qty-stepper span')?.textContent || '1', 10) || 1);
    const image = card?.querySelector('.ph-thumb') || detail?.querySelector('.gallery-main');
    const thumbClass = Array.from(image?.classList || []).find((className) => className.startsWith('ph-')) || 'ph-bear';
    const variant = selectedSize ? `Size: ${selectedSize}` : '';
    const existing = cartState.find((item) => item.name === name && (item.variant || '') === variant);
    if (existing) existing.qty += quantity;
    else cartState.push({ id, name, maker: makerNode?.textContent.trim() || 'Independent maker', price, qty: quantity, variant, supply: 'Product details available on listing', thumbClass, emoji: '🧸' });
    saveCart();
    renderCart();
    openBag();
  };

  renderCart();

  if (bagToggle) bagToggle.addEventListener('click', openBag);
  if (bagClose) bagClose.addEventListener('click', closeBag);
  if (scrim) scrim.addEventListener('click', closeBag);

  // Product tabs (visual state only — wireframe demo)
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
    });
  });

  // Quick-add buttons update the persistent cart model and bag drawer.
  document.querySelectorAll('.quick-add, .cart-btn, .qty-add-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      addProductToCart(btn);
    });
  });

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-cart-action]');
    if (!action) return;
    const item = cartState.find((entry) => entry.id === action.dataset.itemId);
    if (!item) return;
    if (action.dataset.cartAction === 'increase') item.qty += 1;
    if (action.dataset.cartAction === 'decrease') item.qty = Math.max(1, item.qty - 1);
    if (action.dataset.cartAction === 'remove') cartState = cartState.filter((entry) => entry.id !== item.id);
    saveCart();
    renderCart();
  });

  // Wishlist heart toggle on product cards
  document.querySelectorAll('.wish-btn, .wish-btn-lg').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isActive = btn.classList.toggle('is-active');
      btn.setAttribute('aria-pressed', String(isActive));
      if (btn.classList.contains('wish-btn-lg')) {
        btn.setAttribute('aria-label', isActive ? 'Remove from wishlist' : 'Add to wishlist');
      }
    });
  });

  // Header wishlist icon toggle
  const wishlistToggle = document.getElementById('wishlistToggle');
  if (wishlistToggle) {
    wishlistToggle.addEventListener('click', () => {
      wishlistToggle.classList.toggle('is-active');
    });
  }

  // Shop-by-category horizontal scroll arrow
  const categoryArrow = document.getElementById('categoryArrow');
  const categoryList = document.querySelector('.category-list');
  if (categoryArrow && categoryList) {
    categoryArrow.addEventListener('click', () => {
      categoryList.scrollBy({ left: 160, behavior: 'smooth' });
    });
  }

  // Checkout page: payment method selection
  document.querySelectorAll('.payment-option').forEach((option) => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.payment-option').forEach((o) => o.classList.remove('is-active'));
      option.classList.add('is-active');
      const input = option.querySelector('input[type="radio"]');
      if (input) input.checked = true;
    });
  });

  // Product detail: full and close-up gallery views
  document.querySelectorAll('.gallery-view-button').forEach((button) => {
    button.addEventListener('click', () => {
      const view = button.dataset.galleryView || 'full';
      const gallery = button.closest('.gallery');
      const mainImage = gallery?.querySelector('.gallery-main');
      gallery?.querySelectorAll('.gallery-view-button').forEach((viewButton) => {
        const isActive = viewButton === button;
        viewButton.classList.toggle('is-active', isActive);
        viewButton.setAttribute('aria-pressed', String(isActive));
      });
      if (mainImage) {
        mainImage.dataset.galleryView = view;
        const label = mainImage.querySelector('.gallery-view-label');
        if (label) label.textContent = view === 'detail' ? 'Detail view' : 'Product view';
      }
    });
  });

  // Product detail: size/variant pill selection
  document.querySelectorAll('.variant-pills').forEach((group) => {
    group.querySelectorAll('.variant-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        group.querySelectorAll('.variant-pill').forEach((p) => p.classList.remove('is-active'));
        pill.classList.add('is-active');
        const sizeLabel = group.closest('.variant-group')?.querySelector('.variant-label');
        if (sizeLabel) sizeLabel.textContent = `Size: ${pill.textContent.trim()}`;
      });
    });
  });

  // Product detail: quantity stepper
  document.querySelectorAll('.qty-stepper').forEach((stepper) => {
    if (stepper.dataset.cartManaged === 'true') return;
    const display = stepper.querySelector('span');
    const [decreaseBtn, increaseBtn] = stepper.querySelectorAll('button');
    if (!display) return;
    decreaseBtn.addEventListener('click', () => {
      const val = Math.max(1, (parseInt(display.textContent, 10) || 1) - 1);
      display.textContent = val;
    });
    increaseBtn.addEventListener('click', () => {
      const val = (parseInt(display.textContent, 10) || 1) + 1;
      display.textContent = val;
    });
  });

  // Product detail: description/care/shipping tabs
  document.querySelectorAll('.dtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dtab').forEach((t) => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.dtab-panel').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-panel') !== target;
      });
    });
  });

  // Wishlist page: remove item from saved list
  const resultCount = document.querySelector('.result-count');
  document.querySelectorAll('.wish-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.product-card');
      if (card) card.remove();
      if (resultCount) {
        const remaining = document.querySelectorAll('.wish-remove').length;
        resultCount.textContent = `${remaining} item${remaining === 1 ? '' : 's'} saved`;
      }
    });
  });

  // Account page: Sign In / Create Account tab switching
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('is-active'));
      document.querySelectorAll('.auth-form').forEach((f) => f.classList.remove('is-active'));
      tab.classList.add('is-active');
      const target = tab.dataset.auth === 'signin' ? 'signinForm' : 'registerForm';
      const form = document.getElementById(target);
      if (form) form.classList.add('is-active');
    });
  });
});
