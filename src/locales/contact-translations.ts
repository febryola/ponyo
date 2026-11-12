/** Reviewed contact copy: Spanish, Indonesian, Japanese, Korean, Simplified Chinese.
 * English is supplied by exact component/page fallbacks. Merge before other dictionaries.
 * Topic values and the submitted "Phone: " prefix are stable API data, not UI copy.
 */
const rows: ReadonlyArray<readonly [string, string, string, string, string, string]> = [
  ["eyebrow", "UN POCO DE AYUDA, MUCHO CORAZÓN", "BANTUAN KECIL, SEPENUH HATI", "小さなお手伝いに、たっぷりの心を", "작은 도움에, 마음을 가득 담아", "小小帮助，满满心意"],
  ["title", "¿Cómo podemos ayudarte?", "Ada yang bisa kami bantu?", "どのようなご用件ですか？", "무엇을 도와드릴까요?", "有什么可以帮你？"],
  ["intro", "¿Tienes dudas sobre un pedido, el envío o cómo encontrar un peluche? Estás en el lugar indicado.", "Ada pertanyaan tentang pesanan, pengiriman, atau mencari boneka? Kamu berada di tempat yang tepat.", "ご注文や配送、ぬいぐるみ探しについてのご質問は、こちらからどうぞ。", "주문, 배송, 인형 찾기에 관해 궁금한 점이 있나요? 잘 찾아오셨어요.", "想咨询订单、配送，或寻找心仪的毛绒玩具？你来对地方了。"],
  ["team", "Personas reales. Ayuda con cariño.", "Tim sungguhan. Bantuan sepenuh hati.", "スタッフが、心を込めてお手伝い。", "사람이 직접, 마음을 담아 도와드려요.", "真人团队，用心相助。"],
  ["team_body", "Escribe al equipo de Ponyo. Te responderemos al correo que nos indiques.", "Kirim pesan ke tim Ponyo. Kami akan membalas ke alamat email yang kamu berikan.", "Ponyoチームにメッセージをお送りください。ご入力いただいたメールアドレスにお返事します。", "Ponyo 팀에 메시지를 보내 주세요. 남겨 주신 이메일 주소로 답변드릴게요.", "给 Ponyo 团队留个言吧。我们会通过你提供的邮箱回复。"],
  ["faq", "Quizá tu respuesta ya esté aquí", "Mungkin jawabannya sudah ada", "よくあるご質問もご覧ください", "빠른 답변이 기다리고 있을지도 몰라요", "也许答案就在这里"],
  ["faq_body", "Consulta nuestras preguntas frecuentes sobre envíos, tamaños y cuidados.", "Temukan informasi pengiriman, ukuran, dan perawatan di FAQ kami.", "配送・サイズ・お手入れについては、よくあるご質問をご確認ください。", "자주 묻는 질문에서 배송, 크기, 관리 방법을 확인해 보세요.", "查看常见问题，了解配送、尺寸和护理方法。"],
  ["faq_cta", "Ver preguntas frecuentes", "Lihat FAQ", "よくあるご質問を見る", "자주 묻는 질문 보기", "查看常见问题"],
  ["orders", "Tu pedido, siempre a mano", "Pesananmu, mudah ditemukan", "ご注文を、すぐに確認", "주문 내역을 가까이에서", "订单信息，随时可查"],
  ["orders_body", "Revisa tu historial de pedidos antes de enviarnos una consulta sobre un pedido.", "Periksa riwayat pesanan sebelum mengirim pertanyaan tentang pesanan.", "ご注文についてお問い合わせいただく前に、注文履歴をご確認ください。", "주문에 관해 문의하기 전에 주문 내역을 확인해 주세요.", "咨询订单问题前，请先查看订单记录。"],
  ["orders_cta", "Ver tus pedidos", "Lihat pesananmu", "注文履歴を見る", "주문 내역 보기", "查看你的订单"],
  ["form_kicker", "UNA NOTA PARA PONYO", "PESAN UNTUK PONYO", "PONYOへのおたより", "PONYO에게 전하는 이야기", "写给 PONYO"],
  ["form_title", "Envíanos una notita", "Kirim pesan kecil", "ひとこと、お聞かせください", "짧은 메시지를 남겨 주세요", "留个小纸条吧"],
  ["required_note", "Los campos con * son obligatorios. Los demás son opcionales.", "Kolom bertanda * wajib diisi. Yang lainnya terserah kamu.", "*の項目は必須です。それ以外は任意でご入力ください。", "* 표시 항목은 필수예요. 나머지는 자유롭게 작성해 주세요.", "标有 * 的项目为必填，其余项目可自由填写。"],
  ["name", "Nombre", "Nama", "お名前", "이름", "姓名"],
  ["email", "Correo electrónico", "Email", "メールアドレス", "이메일", "电子邮箱"],
  ["phone", "Teléfono", "Nomor telepon", "電話番号", "전화번호", "电话号码"],
  ["optional", "(opcional)", "(opsional)", "（任意）", "(선택)", "（选填）"],
  ["topic", "¿Sobre qué quieres escribirnos?", "Pesanmu tentang apa?", "お問い合わせの内容", "어떤 이야기인가요?", "想聊些什么？"],
  ["topic_order", "Un pedido", "Pesanan", "ご注文について", "주문 문의", "订单问题"],
  ["topic_delivery", "Envío", "Pengiriman", "配送について", "배송 문의", "配送问题"],
  ["topic_plush", "Encontrar un peluche", "Mencari boneka", "ぬいぐるみ探し", "인형 찾기", "寻找毛绒玩具"],
  ["topic_general", "Otra cosa", "Hal lainnya", "その他", "기타 문의", "其他问题"],
  ["message", "Mensaje", "Pesan", "メッセージ", "메시지", "留言"],
  ["message_placeholder", "Cuéntanos un poco cómo podemos ayudarte…", "Ceritakan sedikit bagaimana kami bisa membantu…", "お手伝いできることをお聞かせください…", "어떤 도움이 필요한지 알려 주세요…", "说说有什么需要我们帮忙的吧…"],
  ["privacy", "Comparte solo los datos que necesitamos para ayudarte. Nunca incluyas contraseñas ni datos de pago.", "Cukup bagikan detail yang kami perlukan untuk membantu. Jangan sertakan kata sandi atau detail pembayaran.", "サポートに必要な情報のみをご記入ください。パスワードやお支払い情報は入力しないでください。", "도움에 필요한 정보만 공유해 주세요. 비밀번호나 결제 정보는 절대 포함하지 마세요.", "请仅提供协助所需的信息，切勿填写密码或付款信息。"],
  ["send", "Enviar mensaje", "Kirim pesan", "メッセージを送信", "메시지 보내기", "发送留言"],
  ["sending", "Enviando…", "Mengirim…", "送信中…", "보내는 중…", "正在发送…"],
  ["saved_title", "Tu nota está guardada", "Pesanmu sudah tersimpan", "メッセージを保存しました", "메시지가 저장되었어요", "留言已保存"],
  ["preview_title", "Tu nota está en vista previa", "Pesanmu dalam mode pratinjau", "メッセージのプレビューです", "메시지 미리보기예요", "留言处于预览模式"],
  ["saved_notified", "Tu mensaje está guardado y se ha enviado una notificación por correo a Ponyo.", "Pesanmu tersimpan, dan notifikasi email telah dikirim ke Ponyo.", "メッセージを保存し、Ponyoへのメール通知を送信しました。", "메시지가 저장되었고 Ponyo에 이메일 알림이 전송되었어요.", "留言已保存，并已向 Ponyo 发送邮件通知。"],
  ["saved_no_email", "Tu mensaje está guardado. No se pudo enviar la notificación por correo, pero el equipo de Ponyo puede consultar tu mensaje.", "Pesanmu sudah tersimpan. Notifikasi email belum berhasil dikirim, tetapi tim Ponyo tetap dapat mengakses pesanmu.", "メッセージを保存しました。メール通知を送信できませんでしたが、Ponyoチームは保存されたメッセージを確認できます。", "메시지가 저장되었어요. 이메일 알림을 보내지 못했지만 Ponyo 팀은 저장된 메시지를 확인할 수 있어요.", "留言已保存。邮件通知未能发送，但 Ponyo 团队仍可查看你的留言。"],
  ["preview", "Solo vista previa: tu mensaje no se ha enviado al servidor ni por correo.", "Hanya pratinjau: pesanmu tidak dikirim ke backend maupun melalui email.", "プレビューのみです。メッセージはサーバーにもメールでも送信されていません。", "미리보기 전용이에요. 메시지는 서버나 이메일로 전송되지 않았어요.", "仅为预览：留言未提交至后台，也未通过邮件发送。"],
  ["error_send", "No se ha podido enviar el mensaje. Inténtalo de nuevo; tu nota sigue aquí.", "Pesan belum bisa dikirim. Coba lagi; pesanmu masih ada di sini.", "メッセージを送信できませんでした。入力内容はそのまま残っていますので、もう一度お試しください。", "메시지를 보내지 못했어요. 작성한 내용은 그대로 있으니 다시 시도해 주세요.", "无法发送留言，请重试。你填写的内容仍会保留。"],
  ["error_length", "El nombre no debe superar los 160 caracteres; el teléfono, 60; y el mensaje, 4.800.", "Batasi nama hingga 160 karakter, nomor telepon 60, dan pesan 4.800.", "お名前は160文字、電話番号は60文字、メッセージは4,800文字以内でご入力ください。", "이름은 160자, 전화번호는 60자, 메시지는 4,800자 이내로 작성해 주세요.", "姓名请勿超过 160 个字符，电话 60 个字符，留言 4,800 个字符。"],
];

export const contactTranslations: Record<string, Record<string, string>> = Object.fromEntries(
  ["es", "id", "ja", "ko", "zh-CN"].map((language, index) => [
    language,
    Object.fromEntries(rows.map(([key, ...values]) => [`contact.${key}`, values[index]])),
  ]),
);