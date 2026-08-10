const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const app = express();
app.use(express.json());

const DB_SEED = path.join(__dirname, 'data', 'state.json');
const DB_RUNTIME = path.join(__dirname, 'data', 'runtime.json');
const NOTIFY_FILE = path.join(__dirname, 'data', 'notifications.json');
const WECOM_WEBHOOK = process.env.WECOM_WEBHOOK || '';

// Use runtime.json for persistence (NOT state.json which gets overwritten on deploy)
const DB_FILE = DB_RUNTIME;
// On first boot, copy seed to runtime if no runtime exists
if (!fs.existsSync(DB_RUNTIME) && fs.existsSync(DB_SEED)) {
  fs.copyFileSync(DB_SEED, DB_RUNTIME);
  console.log('📋 Copied seed data to runtime.json');
}

// Optional WeCom AI Bot (non-blocking)
let bot = null;
try {
  bot = require('./bot-service');
  bot.init();
  console.log('🤖 WeCom Bot service loaded');
} catch(e) {
  console.log('⚠️  WeCom Bot not available, web notifications only:', e.message);
}

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { return { tasks: [], optional_items: [], last_updated_by: '', last_updated_at: '', last_save_version: 0 }; }
}
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

function readNotifications() {
  try { return JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8')); } catch(e) { return []; }
}
function writeNotifications(arr) { fs.writeFileSync(NOTIFY_FILE, JSON.stringify(arr, null, 2)); }

// Send WeCom webhook message
function sendWecomMsg(content) {
  if (!WECOM_WEBHOOK) return;
  const data = JSON.stringify({
    msgtype: 'markdown',
    markdown: { content: content }
  });
  const url = new URL(WECOM_WEBHOOK);
  const req = https.request({
    hostname: url.hostname,
    path: url.pathname + url.search,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => { try { console.log('WeCom response:', JSON.parse(body)); } catch(e) {} });
  });
  req.on('error', e => console.error('WeCom webhook error:', e.message));
  req.write(data);
  req.end();
}

app.use(express.static(path.join(__dirname, 'public')));

// Get full state
app.get('/api/state', (req, res) => { res.json(readDB()); });

// Get version only (lightweight check)
app.get('/api/version', (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    res.json({ version: db.last_save_version || 0, updated_by: db.last_updated_by || '', updated_at: db.last_updated_at || '' });
  } catch(e) { res.json({ version: 0, updated_by: '', updated_at: '' }); }
});

// Save full state (with tracking)
app.put('/api/state', (req, res) => {
  try {
    const body = req.body;
    const db = readDB();
    // Preserve existing tasks if body has tasks
    if (body.tasks) db.tasks = body.tasks;
    if (body.optional_items) db.optional_items = body.optional_items;
    // Track who updated
    const who = body.updated_by || body.last_updated_by || '未署名';
    db.last_updated_by = who;
    db.last_updated_at = new Date().toISOString();
    db.last_save_version = (db.last_save_version || 0) + 1;
    writeDB(db);
    res.json({ ok: true, version: db.last_save_version });
  }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// Update single task
app.put('/api/tasks/:id', (req, res) => {
  const db = readDB();
  const idx = db.tasks.findIndex(t => t.id == req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  Object.assign(db.tasks[idx], req.body);
  const who = req.body.updated_by || '未署名';
  db.last_updated_by = who;
  db.last_updated_at = new Date().toISOString();
  db.last_save_version = (db.last_save_version || 0) + 1;
  writeDB(db);
  res.json(db.tasks[idx]);
});

// Update sub-item
app.put('/api/tasks/:taskId/sub-items/:subId', (req, res) => {
  const db = readDB();
  const t = db.tasks.find(t => t.id == req.params.taskId);
  if (!t || !t.sub_items) return res.status(404).json({ error: 'not found' });
  let subs = typeof t.sub_items === 'string' ? JSON.parse(t.sub_items) : t.sub_items;
  const s = subs.find(s => s.id == req.params.subId);
  if (!s) return res.status(404).json({ error: 'not found' });
  s.completed = req.body.completed;
  t.sub_items = JSON.stringify(subs);
  t.completed = subs.every(s => s.completed) ? 1 : 0;
  const who = req.body.updated_by || '未署名';
  db.last_updated_by = who;
  db.last_updated_at = new Date().toISOString();
  db.last_save_version = (db.last_save_version || 0) + 1;
  writeDB(db);
  res.json({ ok: true });
});

// Update optional item
app.put('/api/optional-items/:id', (req, res) => {
  const db = readDB();
  const idx = db.optionals.findIndex(o => o.id == req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'not found' });
  Object.assign(db.optionals[idx], req.body);
  const who = req.body.updated_by || '未署名';
  db.last_updated_by = who;
  db.last_updated_at = new Date().toISOString();
  db.last_save_version = (db.last_save_version || 0) + 1;
  writeDB(db);
  res.json(db.optionals[idx]);
});

// Notification endpoint (stores notifications, used by Web page)
app.post('/api/notify', async (req, res) => {
  try {
    const { who, action, detail, tasks: changedTasks } = req.body;
    const notifications = readNotifications();
    notifications.unshift({
      who: who || '未署名',
      action: action || '更新了进度',
      detail: detail || '',
      tasks: changedTasks || [],
      time: new Date().toISOString()
    });
    if (notifications.length > 50) notifications.length = 50;
    writeNotifications(notifications);

    // Try WeCom AI Bot (WebSocket - non-blocking)
    let botResult = null;
    if (bot) {
      try {
        botResult = await bot.sendNotification({ who, action, detail, tasks: changedTasks });
      } catch(e) { botResult = { ok: false, error: e.message }; }
    }

    // WeCom webhook fallback
    if ((!botResult || !botResult.ok) && WECOM_WEBHOOK) {
      const taskList = (changedTasks && changedTasks.length > 0)
        ? changedTasks.map(t => `> - ${t.title}${t.completed ? ' ✅' : ''}`).join('\n')
        : '';
      const msg = `## 🏪 杭州2店进度更新\n**${who}** ${action}\n${detail}\n${taskList}\n<font color="comment">${new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})}</font>`;
      sendWecomMsg(msg);
    }

    res.json({ ok: true, bot: botResult });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get notifications + bot status
app.get('/api/notifications', (req, res) => {
  const notes = readNotifications().slice(0, 20);
  const botStatus = bot ? bot.getStatus() : null;
  res.json({ notifications: notes, bot: botStatus });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Sync server on port ' + PORT));
