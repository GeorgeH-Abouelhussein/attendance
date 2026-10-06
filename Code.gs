// ورقة "Students":  A: الاسم | B: ID (مخفي) | C: النوع | D: بونص | E وما بعده: تواريخ الاجتماعات (yyyy-MM-dd)
const SHEET = 'Students', LOG = 'Log', UNK = 'Unknown';
const MEETING_DAY = ScriptApp.WeekDay.FRIDAY; // غيّر يوم الاجتماع هنا
const MEETING_HOUR = 6;
const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const tz = () => Session.getScriptTimeZone();
const hdr = h => h instanceof Date ? Utilities.formatDate(h, tz(), 'yyyy-MM-dd') : String(h);
function sheet(n) { const ss = SpreadsheetApp.getActive(); return ss.getSheetByName(n) || ss.insertSheet(n); }

// شغّل setup مرة واحدة من محرر Apps Script (Run)
function setup() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'addTodayColumn').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('addTodayColumn').timeBased().onWeekDay(MEETING_DAY).atHour(MEETING_HOUR).create();
  const sh = sheet(SHEET);
  sh.getRange('A1:D1').setValues([['الاسم', 'ID', 'النوع', 'بونص']]).setFontWeight('bold');
  sh.getRange('C2:C2000').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['ولد', 'بنت'], true).build());
  const n = sh.getLastRow() - 1;
  if (n > 0) { const d = sh.getRange(2, 4, n, 1); d.setValues(d.getValues().map(r => [r[0] === '' ? 0 : r[0]])); }
  sh.hideColumns(2); sh.setFrozenRows(1); sh.setFrozenColumns(1);
  addTodayColumn();
}
function addTodayColumn() {
  const sh = sheet(SHEET);
  ensureCol(sh, sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(hdr), Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd'));
}
function ensureCol(sh, head, date) {
  while (head.length < 4) head.push('');   // أعمدة الاسم/ID/النوع/بونص محجوزة
  let c = head.indexOf(date) + 1;
  if (!c) { c = head.length + 1; head.push(date); sh.getRange(1, c).setNumberFormat('@').setValue(date).setFontWeight('bold'); }
  return c;
}

function progress(id) {
  id = String(id || '').trim().toUpperCase();
  const v = sheet(SHEET).getDataRange().getValues(), head = v[0].map(hdr);
  const cols = []; head.forEach((h, i) => { if (/^\d{4}-\d{2}-\d{2}$/.test(h)) cols.push(i); });
  const r = v.find((row, i) => i && String(row[1]).toUpperCase() === id);
  if (!r) return { ok: false, error: 'notfound' };
  return { ok: true, name: String(r[0]), first: String(r[0]).split(' ')[0], attended: cols.filter(i => r[i] !== '').length, total: cols.length, bonus: Number(r[3]) || 0 };
}

function doGet(e) {
  if (e.parameter && e.parameter.action === 'progress') return out(progress(e.parameter.id));
  const v = sheet(SHEET).getDataRange().getValues();
  const date = (e.parameter && e.parameter.date) || Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd');
  const col = v[0].map(hdr).indexOf(date);
  const students = [], present = [];
  v.slice(1).forEach(r => {
    if (r[1] === '') return;
    students.push({ id: String(r[1]), name: String(r[0]) });
    if (col > 3 && r[col] !== '') present.push(String(r[1]));
  });
  return out({ ok: true, students, date, present, sheetUrl: SpreadsheetApp.getActive().getUrl() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const body = JSON.parse(e.postData.contents), scans = body.scans || [], regs = body.registers || [];
    if (body.selfRegister) return out(selfRegister(body.selfRegister));
    const sh = sheet(SHEET), log = sheet(LOG), unk = sheet(UNK);
    const v = sh.getDataRange().getValues();
    const head = v[0].map(hdr);
    const rowOf = {}; v.forEach((r, i) => { if (i) rowOf[String(r[1])] = i + 1; });
    regs.forEach(r => { if (!rowOf[r.id]) { sh.appendRow([r.name, r.id, r.gender || '', 0]); rowOf[r.id] = sh.getLastRow(); } });
    const seen = new Set(log.getLastRow() ? log.getRange(1, 1, log.getLastRow(), 1).getValues().map(r => r[0]) : []);
    const results = {}, logRows = [];
    scans.forEach(s => {
      let res;
      if (seen.has(s.uuid)) res = 'dup';
      else if (!rowOf[s.id]) { unk.appendRow([s.id, s.date, s.time, s.device]); res = 'unknown'; }
      else if (s.type === 'bonus') { const c = sh.getRange(rowOf[s.id], 4); c.setValue((Number(c.getValue()) || 0) + 1); res = 'bonus'; }
      else {
        const cell = sh.getRange(rowOf[s.id], ensureCol(sh, head, s.date));
        if (cell.getValue() !== '') res = 'already';
        else { cell.setValue('✓'); res = 'ok'; }
      }
      results[s.uuid] = res; seen.add(s.uuid);
      logRows.push([s.uuid, s.id, s.date, s.time, s.device, res + (s.type === 'bonus' ? ' (bonus)' : '')]);
    });
    if (logRows.length) log.getRange(log.getLastRow() + 1, 1, logRows.length, 6).setValues(logRows);
    return out({ ok: true, results });
  } finally { lock.releaseLock(); }
}

// تسجيل ذاتي من موقع الطلاب
function selfRegister(r) {
  const name = String(r.name || '').replace(/\s+/g, ' ').replace(/^[=+\-@]+/, '').trim();
  const gender = r.gender === 'بنت' ? 'بنت' : r.gender === 'ولد' ? 'ولد' : '';
  if (name.length < 2 || name.length > 60 || !gender) return { ok: false, error: 'name' };
  const sh = sheet(SHEET), v = sh.getDataRange().getValues();
  const norm = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
  if (v.some((row, i) => i && norm(row[0]) === norm(name))) return { ok: false, error: 'exists' };
  const ids = new Set(v.map(x => String(x[1])));
  let id; do { id = 'N' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase(); } while (ids.has(id));
  sh.appendRow([name, id, gender, 0]);
  return { ok: true, id, name };
}
