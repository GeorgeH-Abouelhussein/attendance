// بيرسم الكارت على canvas. بيتستخدم في المولّد وفي التطبيق (طالب جديد)
function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); }
async function drawCard(c, p) {
  const { w, h } = CARD, x = c.getContext('2d'); c.width = w; c.height = h;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = CARD.bodyBg; x.fillRect(0, 0, w, h);
  const logo = await loadImg(CARD.logo);
  let hh, qy, qsz, ny;
  if (CARD.logoOnly && logo) {            // لوجو كبير فوق
    hh = 330; qy = 365; qsz = 330; ny = 760;
    x.fillStyle = CARD.headerBg; x.fillRect(0, 0, w, hh);
    x.drawImage(logo, (w - 310) / 2, 10, 310, 310);
  } else {                                // لوجو صغير + عنوان
    hh = 190; qy = 250; qsz = 360; ny = 700;
    x.fillStyle = CARD.primary; x.fillRect(0, 0, w, hh);
    if (logo) x.drawImage(logo, 40, 35, 120, 120);
    x.fillStyle = CARD.headerText; x.font = 'bold 40px ' + CARD.font; x.fillText(CARD.title, logo ? (w + 160) / 2 : w / 2, 95, w - 240);
  }
  x.fillStyle = CARD.accent; x.fillRect(0, hh, w, 8);
  // QR (مرسوم مربعات عشان يطلع حاد) داخل إطار أبيض بحدود برتقالي
  const q = qrcode(0, 'M'); q.addData(p.id); q.make();
  const n = q.getModuleCount(), m = Math.floor(qsz / n), qs = m * n, ox = (w - qs) / 2;
  x.fillStyle = CARD.accent; x.fillRect(ox - 24, qy - 24, qs + 48, qs + 48);
  x.fillStyle = '#fff'; x.fillRect(ox - 18, qy - 18, qs + 36, qs + 36);
  x.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect(ox + k * m, qy + r * m, m, m);
  // الاسم والـ ID
  let fs = 52; x.fillStyle = CARD.nameColor;
  do { x.font = 'bold ' + fs + 'px ' + CARD.font; fs -= 2; } while (x.measureText(p.name).width > w - 60 && fs > 20);
  x.fillText(p.name, w / 2, ny);
  x.font = '26px ' + CARD.font; x.fillStyle = '#8a6a55'; x.fillText(p.id, w / 2, ny + 52);
  // الفوتر
  x.fillStyle = CARD.primary; x.fillRect(0, h - 64, w, 64);
  x.fillStyle = CARD.headerText; x.font = '26px ' + CARD.font; x.fillText(CARD.subtitle, w / 2, h - 32);
}
