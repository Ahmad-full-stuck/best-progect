'use strict';
/*
 * نُور — سيرفر محلي صفري الاعتماديات
 * --------------------------------------------
 * يخدم المجلد الحالي (index.html + css + js + fonts) ويحفظ كل بيانات
 * التطبيق داخل قاعدة SQLite (noor.db) في نفس المجلد، فيتحرك المجلد
 * كاملاً مع بياناته. لا يحتاج npm install ولا أي حزمة خارجية.
 *
 * التشغيل: node server.js   (أو انقر start.bat / start.sh)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

/* التأكد من إصدار Node (node:sqlite متوفر من 22.5 فقط) */
if (!process.versions.node || parseInt(process.versions.node.split('.')[0], 10) < 22 ||
    (parseInt(process.versions.node.split('.')[0], 10) === 22 && parseInt(process.versions.node.split('.')[1], 10) < 5)) {
  console.error('✗ نُور يتطلب Node.js ≥ 22.5. إصدارك الحالي: ' + process.versions.node);
  console.error('  حمّل الأحدث من https://nodejs.org ثم أعد المحاولة.');
  process.exit(1);
}
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'noor.db');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const BACKUP_DIR = path.join(ROOT, 'backups');

const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

/* ===== إعداد قاعدة البيانات ===== */
for (const d of [UPLOAD_DIR, BACKUP_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

function snapMeta() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'snapshot_meta'").get();
    return row ? JSON.parse(row.value) : { exists: false };
  } catch (_) {
    return { exists: false };
  }
}

function setKV(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

/* ===== أدوات ===== */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (limitBytes && size > limitBytes) {
        reject(new Error('الحمولة كبيرة جداً'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  if (p !== base && !p.startsWith(base + path.sep)) return null;
  return p;
}

function openBrowser(url) {
  const plat = process.platform;
  let cmd;
  if (plat === 'darwin') cmd = `open "${url}"`;
  else if (plat === 'win32') cmd = `cmd /c start "" "${url}"`;
  else cmd = `xdg-open "${url}"`;
  try { exec(cmd); } catch (_) { /* تجاهل */ }
}

/* ===== المسارات ===== */
async function handleApi(req, res, url) {
  const { pathname } = url;

  // فحص الاتصال
  if (req.method === 'GET' && pathname === '/api/health') {
    const ok = !!db.prepare('SELECT 1 AS ok').get();
    return sendJSON(res, 200, { ok: true, db: ok ? 'connected' : 'error' });
  }

  // التحكم في النسخ الاحتياطي التلقائي
  if (req.method === 'GET' && pathname === '/api/backup-status') {
    return sendJSON(res, 200, { enabled: autoBackupEnabled });
  }
  if (req.method === 'POST' && pathname === '/api/backup-toggle') {
    autoBackupEnabled = !autoBackupEnabled;
    return sendJSON(res, 200, { enabled: autoBackupEnabled });
  }

  // معلومات آخر لقطة
  if (req.method === 'GET' && pathname === '/api/sync/info') {
    const m = snapMeta();
    m.db_ok = !!db.prepare('SELECT 1 AS ok').get();
    return sendJSON(res, 200, m);
  }

  // سحب آخر لقطة
  if (req.method === 'GET' && pathname === '/api/sync') {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'snapshot_latest'").get();
    if (!row || !row.value) return sendJSON(res, 404, { error: 'لا توجد لقطة محفوظة بعد' });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(row.value);
  }

  // دفع لقطة (تُستدعى بعد كل عملية في الواجهة)
  // حماية من «الدفع الانتحالي» من مواقع خارجية: طلبات no-cors لا تستطيع ضبط ترويسة مخصصة
  if (req.method === 'POST' && pathname === '/api/sync') {
    if (req.headers['x-noor-sync'] !== '1') return sendJSON(res, 403, { error: 'مرفوض' });
    let buf;
    try { buf = await readBody(req, 64 * 1024 * 1024); }
    catch (e) { return sendJSON(res, 413, { error: 'الحمولة كبيرة جداً' }); }
    let b;
    try { b = JSON.parse(buf.toString('utf8')); }
    catch (e) { return sendJSON(res, 400, { error: 'JSON غير صالح' }); }
    if (!b || b.app !== 'noor' || !b.data || !b.data.settings) {
      return sendJSON(res, 400, { error: 'لقطة غير صالحة' });
    }
    const savedAt = new Date().toISOString();
    const json = JSON.stringify(b);
    setKV('snapshot_latest', json);
    setKV('snapshot_meta', JSON.stringify({ exists: true, saved_at: savedAt, exported_at: b.exported_at || null }));
    saveDailyBackup(json);
    saveFileBackup(json, savedAt);
    return sendJSON(res, 200, { ok: true, saved_at: savedAt });
  }

  // رفع ملف كبير (PDF/صورة...) خارج القاعدة
  if (req.method === 'PUT' && pathname.startsWith('/api/upload/')) {
    const name = decodeURIComponent(pathname.slice('/api/upload/'.length));
    const base = path.basename(name);
    if (!base || base !== name) return sendJSON(res, 400, { error: 'اسم ملف غير صالح' });
    const dest = path.join(UPLOAD_DIR, base);
    try {
      const buf = await readBody(req, 1024 * 1024 * 1024);
      fs.writeFileSync(dest, buf);
      return sendJSON(res, 200, { ok: true, url: '/uploads/' + encodeURIComponent(base), name: base });
    } catch (e) {
      return sendJSON(res, 500, { error: 'فشل الرفع: ' + e.message });
    }
  }

  return sendJSON(res, 404, { error: 'غير موجود' });
}

let lastBackup = 0;

/* نسخة ملفية يومية — تُكتب مرة واحدة في اليوم الأول فقط (بلا إعادة كتابة مع كل دفع) */
let dailyBackupDone = '';
let autoBackupEnabled = false; /* معطّل افتراضيًا — يُفعّل فقط بطلب المستخدم */
function saveDailyBackup(json) {
  if (!autoBackupEnabled) return;
  try {
    const day = new Date().toISOString().slice(0, 10);
    if (dailyBackupDone === day) return;
    const dest = path.join(BACKUP_DIR, `noor-day-${day}.json`);
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, json, 'utf8');
    dailyBackupDone = day;
  } catch (_) { /* تجاهل فشل النسخة اليومية */
  }
}

function saveFileBackup(json, savedAt) {
  if (!autoBackupEnabled) return;
  const now = Date.now();
  if (now - lastBackup < 12 * 3600 * 1000) return; // نسخة ملفية كل 12 ساعة على الأقل
  try {
    const stamp = savedAt.slice(0, 16).replace(/[:T]/g, '-');
    fs.writeFileSync(path.join(BACKUP_DIR, `noor-auto-${stamp}.json`), json, 'utf8');
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('noor-auto-')).sort();
    while (files.length > 30) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, files.shift())); } catch (_) { break; }
    }
    lastBackup = now;
  } catch (_) { /* تجاهل فشل النسخة */ }
}

/* ===== خدمة الملفات الثابتة ===== */
function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  // مسار الرفع يُخدم من مجلد uploads
  let baseDir = ROOT;
  if (pathname.startsWith('/uploads/')) {
    baseDir = UPLOAD_DIR;
    pathname = pathname.slice('/uploads'.length) || '/';
  }

  const filePath = safeJoin(baseDir, pathname);
  if (!filePath) { res.writeHead(403); return res.end('Forbidden'); }

  /* ملفات قاعدة البيانات والنسخ الاحتياطية وملفات التشغيل لا تُخدم للتنقل — بيانات حساسة */
  const blocked =
    pathname === '/noor.db' || pathname === '/noor.db-wal' || pathname === '/noor.db-shm' ||
    pathname.startsWith('/backups/') ||
    pathname === '/server.js' || pathname === '/start.bat' || pathname === '/package.json';
  if (blocked) {
    return notFound(res, 'غير موجود');
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      // صفحة واحدة: أي مسار غير ملف يرجع index.html
      if (!pathname.includes('.')) return serveIndex(res);
      return notFound(res, 'الملف غير موجود');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    const stream = fs.createReadStream(filePath);
    /* بلا معالج أخطاء هنا يبقى الطلب معلقاً إلى الأبد لو حُذف الملف بين الفحص والقراءة */
    stream.on('error', () => { try { res.destroy(); } catch (_) {} });
    stream.pipe(res);
  });
}

function notFound(res, msg) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<title>نُور — 404</title></head><body style="font-family:Tajawal,system-ui,sans-serif;' +
    'background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center">' +
    '<div style="text-align:center"><h1>٤٠٤</h1><p>' + (msg || 'الصفحة غير موجودة') +
    '</p><a href="/" style="color:#f5c542">العودة إلى نُور</a></div></body></html>');
}

function serveIndex(res) {
  const idx = path.join(ROOT, 'index.html');
  fs.readFile(idx, (err, buf) => {
    if (err) { res.writeHead(500); return res.end('لا يوجد index.html'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buf);
  });
}

/* ===== الخادم ===== */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => sendJSON(res, 500, { error: String(e && e.message || e) }));
    return;
  }
  serveStatic(req, res, url);
});

function listenOn(port) {
  server.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}/`;
    console.log(`\n  نُور يعمل على: ${url}`);
    console.log(`  قاعدة البيانات: ${DB_PATH}`);
    console.log(`  اضغط Ctrl+C للإيقاف\n`);
    setTimeout(() => openBrowser(url), 400);
  });
  server.on('error', (e) => {
    if (e && e.code === 'EADDRINUSE' && port < PORT + 20) listenOn(port + 1);
    else { console.error('تعذر التشغيل:', e.message); process.exit(1); }
  });
}

listenOn(PORT);

/* إيقاف نظيف: إغلاق قاعدة البيانات عند الخروج */
function shutdown(signal) {
  console.log('\n  جارٍ الإيقاف (' + signal + ')...');
  try { db.close(); } catch (_) {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 800);
}
process.on('SIGINT', () => shutdown('Ctrl+C'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => { console.error('خطأ غير متوقع:', e && e.message); });
