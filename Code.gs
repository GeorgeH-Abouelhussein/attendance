// ورقة "Students":  A: الاسم | B: ID (مخفي) | C وما بعده: تواريخ الاجتماعات (yyyy-MM-dd)
const SHEET = 'Students', LOG = 'Log', UNK = 'Unknown';
const MEETING_DAY = ScriptApp.WeekDay.FRIDAY; // غيّر يوم الاجتماع هنا
const MEETING_HOUR = 6;                        // الساعة اللي يتعمل فيها العمود الجديد
const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
const tz = () => Session.getScriptTimeZone();
const hdr = h => h instanceof Date ? Utilities.formatDate(h, tz(), 'yyyy-MM-dd') : String(h);
function sheet(n) { const ss = SpreadsheetApp.getActive(); return ss.getSheetByName(n) || ss.insertSheet(n); }

// شغّل الدالة دي مرة واحدة بس من محرر Apps Script (Run) وبعدها كل حاجة أوتوماتيك
function setup() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'addTodayColumn').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('addTodayColumn').timeBased().onWeekDay(MEETING_DAY).atHour(MEETING_HOUR).create();
  const sh = sheet(SHEET);
  sh.hideColumns(2); sh.setFrozenRows(1); sh.setFrozenColumns(1);
  addTodayColumn();
}

// بيعمل عمود النهاردة (لو مش موجود) وبيشتغل أسبوعياً بالـ trigger
function addTodayColumn() {
  const sh = sheet(SHEET);
  ensureCol(sh, sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(hdr), Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd'));
}
function ensureCol(sh, head, date) {
  let c = head.indexOf(date) + 1;
  if (!c) { c = head.length + 1; head.push(date); sh.getRange(1, c).setNumberFormat('@').setValue(date).setFontWeight('bold'); }
  return c;
}

function doGet(e) {
  const v = sheet(SHEET).getDataRange().getValues();
  const date = (e.parameter && e.parameter.date) || Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd');
  const col = v[0].map(hdr).indexOf(date);
  const students = [], present = [];
  v.slice(1).forEach(r => {
    if (r[1] === '') return;
    students.push({ id: String(r[1]), name: String(r[0]) });
    if (col > -1 && r[col] !== '') present.push(String(r[1]));
  });
  return out({ ok: true, students, date, present });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const body = JSON.parse(e.postData.contents), scans = body.scans || [], regs = body.registers || [];
    const sh = sheet(SHEET), log = sheet(LOG), unk = sheet(UNK);
    const v = sh.getDataRange().getValues();
    const head = v[0].map(hdr);
    const rowOf = {}; v.forEach((r, i) => { if (i) rowOf[String(r[1])] = i + 1; });
    const seen = new Set(log.getLastRow() ? log.getRange(1, 1, log.getLastRow(), 1).getValues().map(r => r[0]) : []);
    const results = {}, logRows = [];
    regs.forEach(r => { if (!rowOf[r.id]) { sh.appendRow([r.name, r.id]); rowOf[r.id] = sh.getLastRow(); } });
    scans.forEach(s => {
      let res;
      if (seen.has(s.uuid)) res = 'dup';
      else if (!rowOf[s.id]) { unk.appendRow([s.id, s.date, s.time, s.device]); res = 'unknown'; }
      else {
        const cell = sh.getRange(rowOf[s.id], ensureCol(sh, head, s.date));
        if (cell.getValue() !== '') res = 'already';
        else { cell.setValue('✓'); res = 'ok'; }
      }
      results[s.uuid] = res; seen.add(s.uuid);
      logRows.push([s.uuid, s.id, s.date, s.time, s.device, res]);
    });
    if (logRows.length) log.getRange(log.getLastRow() + 1, 1, logRows.length, 6).setValues(logRows);
    return out({ ok: true, results });
  } finally { lock.releaseLock(); }
}
