const $ = id => document.getElementById(id);
const today = () => new Date().toLocaleDateString('en-CA');
const nowT = () => new Date().toLocaleTimeString('en-GB');
// ---- IndexedDB ----
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open('att', 1);
  r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('students', { keyPath: 'id' }); d.createObjectStore('scans', { keyPath: 'uuid' }); d.createObjectStore('meta'); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const tx = async (s, m, f) => { const d = await dbp; return new Promise((res, rej) => { const t = d.transaction(s, m), o = t.objectStore(s), q = f(o); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
const all = s => tx(s, 'readonly', o => o.getAll());
const put = (s, v, k) => tx(s, 'readwrite', o => o.put(v, k));
const getMeta = k => tx('meta', 'readonly', o => o.get(k));
// ---- state ----
const cfg = { url: localStorage.url || '', dev: localStorage.dev || 'device-' + Math.random().toString(36).slice(2, 5) };
let students = {}, present = new Set(), last = '', lastT = 0;
async function load() {
  students = Object.fromEntries((await all('students')).map(s => [s.id, s.name]));
  ((await getMeta('regs')) || []).forEach(r => students[r.id] = r.name);
  const p = await getMeta('present'); present = new Set(p && p.date === today() ? p.ids : []);
  const sc = await all('scans'); sc.filter(s => s.date === today()).forEach(s => present.add(s.id));
  render(sc);
}
function render(sc) {
  const pend = sc.filter(s => !s.synced).length;
  $('status').textContent = (navigator.onLine ? '🟢' : '🔴') + ' معلّق: ' + pend;
  $('recent').innerHTML = sc.sort((a, b) => b.ts - a.ts).slice(0, 6).map(s => `<li>${s.unknown ? '❓' : '✓'} ${students[s.id] || s.id} <small>${s.time}</small> ${s.synced ? '☁️' : ''}</li>`).join('');
}
function show(msg, cls) { const b = $('banner'); b.textContent = msg; b.className = cls; if (navigator.vibrate) navigator.vibrate(cls === 'ok' ? 80 : [60, 60, 60]); }
async function onScan(text) {
  const id = text.trim();
  if (id === last && Date.now() - lastT < 3000) return; last = id; lastT = Date.now();
  const name = students[id];
  if (present.has(id)) return show('⚠ ' + (name || id) + ' اتسجل قبل كده', 'warn');
  present.add(id);
  await put('scans', { uuid: crypto.randomUUID(), id, date: today(), time: nowT(), ts: Date.now(), device: cfg.dev, unknown: !name, synced: false });
  show(name ? '✓ أهلاً ' + name : '❓ غير معروف: ' + id, name ? 'ok' : 'err');
  load(); sync();
}
// ---- sync ----
let syncing = false;
async function sync() {
  if (syncing || !cfg.url || !navigator.onLine) return; syncing = true;
  try {
    const pend = (await all('scans')).filter(s => !s.synced), regs = (await getMeta('regs')) || [];
    if (pend.length || regs.length) {
      const r = await (await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ registers: regs, scans: pend }) })).json();
      if (r.ok) { const left = ((await getMeta('regs')) || []).filter(x => !regs.some(y => y.id === x.id)); await put('meta', left, 'regs'); }
      if (r.ok) for (const s of pend) if (r.results[s.uuid]) await put('scans', { ...s, synced: true });
    }
    const d = await (await fetch(cfg.url + '?date=' + today())).json();
    if (d.ok) {
      await tx('students', 'readwrite', o => { o.clear(); d.students.forEach(s => o.put(s)); });
      await put('meta', { date: d.date, ids: d.present }, 'present');
    }
  } catch (e) { console.log('sync failed', e); }
  syncing = false; load();
}
async function exportCsv() {
  const rows = [['id', 'name', 'date', 'time', 'device', 'synced'], ...(await all('scans')).map(s => [s.id, students[s.id] || '', s.date, s.time, s.device, s.synced])];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }));
  a.download = 'scans-' + today() + '.csv'; a.click();
}
// ---- طالب جديد ----
let cur = null;
$('nw').onclick = () => { $('nname').value = ''; $('qrc').style.display = $('nsh').style.display = 'none'; $('ndlg').showModal(); };
$('ncl').onclick = () => $('ndlg').close();
$('nmk').onclick = async () => {
  const name = $('nname').value.trim(); if (!name) return;
  const id = 'N' + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 4).toUpperCase();
  const regs = (await getMeta('regs')) || []; regs.push({ id, name }); await put('meta', regs, 'regs');
  cur = { id, name }; await load(); drawQR(id, name); sync();
};
function drawQR(id, name) { drawCard($('qrc'), { id, name }).then(() => { $('qrc').style.display = $('nsh').style.display = 'block'; }); }
$('nsh').onclick = () => $('qrc').toBlob(async b => {
  const f = new File([b], 'qr-' + cur.id + '.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); } catch (e) {} }
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = f.name; a.click(); }
});
// ---- init ----
$('sync').onclick = sync; $('csv').onclick = exportCsv;
$('cfg').onclick = () => { $('url').value = cfg.url; $('dev').value = cfg.dev; $('dlg').showModal(); };
$('save').onclick = () => { cfg.url = localStorage.url = $('url').value.trim(); cfg.dev = localStorage.dev = $('dev').value.trim(); $('dlg').close(); sync(); };
addEventListener('online', sync); addEventListener('offline', load); setInterval(sync, 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
new Html5Qrcode('reader').start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, onScan).catch(e => show('الكاميرا مش شغالة: ' + e, 'err'));
load().then(() => cfg.url ? sync() : $('cfg').click());
