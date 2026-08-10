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

// GitHub persistence — use GitHub as source of truth so progress survives Render restarts
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO = 'kexinyao7-afk/hangzhou2-store';
const RUNTIME_REMOTE_PATH = 'data/runtime.json';
let githubRuntimeSha = null;  // cached SHA for updates

// ---- GitHub API helper ----
function githubRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.github.com${apiPath}`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'hangzhou2-store-sync',
        'Content-Type': 'application/json'
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(`GitHub ${res.statusCode}: ${json.message || data}`));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ---- Load runtime from GitHub on startup ----
async function loadRuntimeFromGitHub() {
  if (!GITHUB_TOKEN) { console.log('⚠️  No GITHUB_TOKEN set, using local runtime only'); return; }
  try {
    const data = await githubRequest('GET', `/repos/${GITHUB_REPO}/contents/${RUNTIME_REMOTE_PATH}`);
    githubRuntimeSha = data.sha;
    const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    // Only use GitHub version if it has actual progress (version > 0)
    if ((content.last_save_version || 0) > 0) {
      fs.writeFileSync(DB_RUNTIME, JSON.stringify(content, null, 2));
      console.log('📥 Loaded runtime from GitHub v' + content.last_save_version + ' (sha:', githubRuntimeSha.substring(0, 7) + ')');
    } else {
      console.log('📥 GitHub runtime is v0, using local seed');
    }
  } catch(e) {
    console.log('⚠️  Could not load runtime from GitHub:', e.message);
  }
}

// ---- Push runtime to GitHub after every save ----
let _syncTimer = null;
function syncRuntimeToGitHub(db) {
  if (!GITHUB_TOKEN) return;
  // Debounce: sync at most once per 3 seconds
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    try {
      const content = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');
      const body = {
        message: `🔄 ${db.last_updated_by || 'Auto'} 更新 v${db.last_save_version}`,
        content
      };
      if (githubRuntimeSha) body.sha = githubRuntimeSha;
      const result = await githubRequest('PUT', `/repos/${GITHUB_REPO}/contents/${RUNTIME_REMOTE_PATH}`, body);
      githubRuntimeSha = result.content.sha;
      console.log('📤 Synced to GitHub v' + db.last_save_version + ' (sha:', githubRuntimeSha.substring(0, 7) + ')');
    } catch(e) {
      // If SHA conflict, re-fetch and retry once
      if (e.message.includes('409')) {
        console.log('⚠️  GitHub SHA conflict, re-fetching...');
        try {
          const data = await githubRequest('GET', `/repos/${GITHUB_REPO}/contents/${RUNTIME_REMOTE_PATH}`);
          githubRuntimeSha = data.sha;
          const content = Buffer.from(JSON.stringify(db, null, 2)).toString('base64');
          await githubRequest('PUT', `/repos/${GITHUB_REPO}/contents/${RUNTIME_REMOTE_PATH}`, {
            message: `🔄 ${db.last_updated_by || 'Auto'} 更新 v${db.last_save_version} (retry)`,
            content,
            sha: githubRuntimeSha
          });
          console.log('📤 Synced to GitHub (retry ok) v' + db.last_save_version);
        } catch(e2) { console.log('⚠️  GitHub sync retry also failed:', e2.message); }
      } else {
        console.log('⚠️  GitHub sync failed:', e.message);
      }
    }
  }, 3000);
}

// ---- Local DB helpers ----
const DB_FILE = DB_RUNTIME;

function readDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { return { tasks: [], optional_items: [], last_updated_by: '', last_updated_at: '', last_save_version: 0 }; }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  syncRuntimeToGitHub(data);   // 👈 push to GitHub as source of truth
}

function readNotifications() {
  try { return JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf8')); } catch(e) { return []; }
}
function writeNotifications(arr) { fs.writeFileSync(NOTIFY_FILE, JSON.stringify(arr, null, 2)); }

// ---- WeCom webhook ----
function sendWecomMsg(content) {
  if (!WECOM_WEBHOOK) return;
  const data = JSON.stringify({ msgtype: 'markdown', markdown: { content } });
  const url = new URL(WECOM_WEBHOOK);
  const req = https.request({
    hostname: url.hostname, path: url.pathname + url.search,
    method: 'POST', headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => { try { JSON.parse(body); } catch(e) {} });
  });
  req.on('error', e => console.error('WeCom error:', e.message));
  req.write(data);
  req.end();
}

// ---- Optional WeCom Bot ----
let bot = null;
try {
  bot = require('./bot-service');
  bot.init();
  console.log('🤖 WeCom Bot loaded');
} catch(e) {
  console.log('⚠️  WeCom Bot unavailable, web-only:', e.message);
}

// ---- Startup sequence: 1) try GitHub → 2) local runtime → 3) seed ----
(async function boot() {
  // Step 1: Load from GitHub (source of truth)
  await loadRuntimeFromGitHub();

  // Step 2: If local runtime still doesn't exist, copy from seed
  if (!fs.existsSync(DB_RUNTIME) && fs.existsSync(DB_SEED)) {
    fs.copyFileSync(DB_SEED, DB_RUNTIME);
    console.log('📋 Copied seed → runtime.json');
  }

  // Step 3: If there's progress, do an initial sync to GitHub so SHA is current
  if (GITHUB_TOKEN) {
    const db = readDB();
    if ((db.last_save_version || 0) > 0) {
      await syncRuntimeToGitHub(db);
    }
  }
})();

// ---- API routes ----
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (req, res) => { res.json(readDB()); });

app.get('/api/version', (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    res.json({ version: db.last_save_version || 0, updated_by: db.last_updated_by || '', updated_at: db.last_updated_at || '' });
  } catch(e) { res.json({ version: 0, updated_by: '', updated_at: '' }); }
});

// Full state save
app.put('/api/state', (req, res) => {
  try {
    const body = req.body;
    const db = readDB();
    if (body.tasks) db.tasks = body.tasks;
    if (body.optional_items) db.optional_items = body.optional_items;
    const who = body.updated_by || body.last_updated_by || '未署名';
    db.last_updated_by = who;
    db.last_updated_at = new Date().toISOString();
    db.last_save_version = (db.last_save_version || 0) + 1;
    writeDB(db);
    res.json({ ok: true, version: db.last_save_version });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Single task update
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

// Sub-item update
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

// Optional item update
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

// Notification
app.post('/api/notify', async (req, res) => {
  try {
    const { who, action, detail, tasks: changedTasks } = req.body;
    const notifications = readNotifications();
    notifications.unshift({
      who: who || '未署名', action: action || '更新了进度',
      detail: detail || '', tasks: changedTasks || [],
      time: new Date().toISOString()
    });
    if (notifications.length > 50) notifications.length = 50;
    writeNotifications(notifications);

    let botResult = null;
    if (bot) {
      try { botResult = await bot.sendNotification({ who, action, detail, tasks: changedTasks }); }
      catch(e) { botResult = { ok: false, error: e.message }; }
    }
    if ((!botResult || !botResult.ok) && WECOM_WEBHOOK) {
      const taskList = (changedTasks && changedTasks.length > 0)
        ? changedTasks.map(t => `> - ${t.title}${t.completed ? ' ✅' : ''}`).join('\n') : '';
      const msg = `## 🏪 杭州2店进度更新\n**${who}** ${action}\n${detail}\n${taskList}\n<font color="comment">${new Date().toLocaleString('zh-CN', {timeZone:'Asia/Shanghai'})}</font>`;
      sendWecomMsg(msg);
    }
    res.json({ ok: true, bot: botResult });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notifications', (req, res) => {
  res.json({ notifications: readNotifications().slice(0, 20), bot: bot ? bot.getStatus() : null });
});

// Health check
app.get('/api/health', (req, res) => {
  const db = readDB();
  res.json({
    ok: true,
    version: db.last_save_version || 0,
    github_sync: !!GITHUB_TOKEN,
    updated_at: db.last_updated_at || ''
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('🚀 杭州2店同步服务已启动，端口', PORT));
