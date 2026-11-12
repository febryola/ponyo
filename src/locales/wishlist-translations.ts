/** Wishlist studio copy. English is supplied by component fallbacks. */
const rows: ReadonlyArray<readonly [string, string, string, string, string, string]> = [
  ["eyebrow", "ESAS PEQUEÑAS COSAS QUE AMAS", "HAL-HAL KECIL YANG KAMU SUKA", "心ときめく、小さなものたち", "마음을 사로잡는 작은 것들", "那些让你心动的小美好"],
  ["title", "Mi lista de deseos", "Wishlist-ku", "ほしいものリスト", "나의 위시리스트", "我的心愿单"],
  ["subtitle", "Una pequeña colección de peluches que no puedes sacarte de la cabeza. Tenlos cerca hasta que llegue el momento.", "Koleksi kecil boneka yang selalu terbayang. Simpan dekat di hati, sampai kamu siap membawanya pulang.", "つい思い浮かべてしまうぬいぐるみたちの、小さなコレクション。お迎えするその日まで、そばに置いておきましょう。", "자꾸만 생각나는 인형들을 모아 두는 작은 공간. 데려올 준비가 될 때까지 가까이 두세요.", "把那些念念不忘的毛绒伙伴，收进小小的珍藏。先留在身边，等你准备好再带它们回家。"],
  ["saved", "Favoritos guardados", "Favorit tersimpan", "保存したお気に入り", "저장한 즐겨찾기", "已收藏的心动好物"],
  ["browse", "Descubrir más peluches", "Temukan lebih banyak boneka", "もっとぬいぐるみを探す", "더 많은 인형 둘러보기", "发现更多毛绒伙伴"],
  ["collection", "Tu colección personal", "Koleksi pribadimu", "あなただけのコレクション", "나만의 컬렉션", "你的专属珍藏"],
  ["collection_hint", "Todos tus favoritos, elegidos con el corazón, en un solo lugar.", "Semua favorit pilihan hatimu, bersama di satu tempat.", "心で選んだお気に入りを、ひとつの場所に。", "마음으로 고른 소중한 인형들을 한곳에 모았어요.", "把所有用心挑选的喜爱，珍藏在同一个地方。"],
  ["count", "{{ count }} guardados", "{{ count }} tersimpan", "{{ count }}件保存済み", "{{ count }}개 저장됨", "已收藏 {{ count }} 件"],
  ["empty_title", "Hazle un hueco a un poquito de amor.", "Sisakan tempat untuk sedikit cinta.", "小さなときめきのために、場所を空けて。", "작은 설렘을 위한 자리를 마련해 보세요.", "为一点小小的心动，留个位置吧。"],
  ["empty_body", "¿Encontraste un peluche que va contigo? Toca su corazón y lo guardaremos aquí para tu próxima visita.", "Menemukan boneka yang cocok denganmu? Ketuk ikon hatinya, dan kami akan menyimpannya di sini untuk kunjunganmu berikutnya.", "自分らしいぬいぐるみに出会えましたか？ハートをタップすると、次に訪れるときのためにここに保存できます。", "내 마음에 꼭 맞는 인형을 찾았나요? 하트를 누르면 다음에 다시 만날 수 있도록 여기에 저장해 드려요.", "遇到一只让你心动的毛绒伙伴了吗？轻点它的爱心，我们会把它留在这里，等你下次来看。"],
  ["empty_cta", "Encuentra tu primer favorito", "Temukan favorit pertamamu", "はじめてのお気に入りを見つける", "첫 번째 최애 찾기", "找到你的第一份心动"],
  ["empty_note", "Un pequeño corazón. El comienzo de algo bonito.", "Satu hati kecil. Awal dari sesuatu yang indah.", "小さなハートから、すてきな出会いが始まります。", "작은 하트 하나. 사랑스러운 만남의 시작.", "一颗小小的爱心，一段美好的开始。"],
  ["checking", "Reuniendo tus favoritos…", "Mengumpulkan favoritmu…", "お気に入りを集めています…", "좋아하는 인형들을 모으고 있어요…", "正在整理你的收藏…"],
  ["synced", "Tus favoritos están guardados en tu cuenta de Ponyo.", "Favoritmu tersimpan di akun Ponyo-mu.", "お気に入りをPonyoアカウントに保存しました。", "즐겨찾기가 Ponyo 계정에 저장되었어요.", "你的收藏已保存到 Ponyo 账户。"],
  ["sync_failed", "No se pudieron sincronizar algunos favoritos. Intenta guardarlos de nuevo.", "Beberapa favorit belum bisa disinkronkan. Coba simpan lagi.", "一部のお気に入りを同期できませんでした。もう一度保存してみてください。", "일부 즐겨찾기를 동기화하지 못했어요. 다시 저장해 주세요.", "部分收藏未能同步，请尝试重新保存。"],
  ["check_failed", "No pudimos consultar los favoritos de tu cuenta en este momento.", "Kami belum bisa memeriksa favorit di akunmu saat ini.", "現在、アカウントのお気に入りを確認できませんでした。", "지금은 계정의 즐겨찾기를 확인할 수 없어요.", "暂时无法查看你账户中的收藏。"],
  ["tip", "Enamórate ahora. Vuelve a buscarlo después.", "Suka sekarang. Kembali lagi nanti.", "今のときめきを、また会う日のために。", "지금 마음에 담고, 나중에 다시 만나요.", "此刻心动，留待下次重逢。"],
  ["rare", "Explorar hallazgos únicos", "Jelajahi temuan langka", "レアな出会いを探す", "희귀한 보물 둘러보기", "探索稀有好物"],
];

export const wishlistTranslations: Record<string, Record<string, string>> = Object.fromEntries(
  ["es", "id", "ja", "ko", "zh-CN"].map((language, index) => [
    language,
    Object.fromEntries(rows.map(([key, ...values]) => [`wishlist.studio.${key}`, values[index]])),
  ]),
);