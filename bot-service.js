// WeCom AI Bot Service - manages WebSocket connection to WeCom aibot
// Receives notifications from sync-server.js and proactively pushes to a group
const AiBot = require('@wecom/aibot-node-sdk');

const BOT_ID = process.env.WECOM_BOT_ID || 'aibAyCsZCdFVRJXIMYKtC0HxhJSRSdoTTFG';
const BOT_SECRET = process.env.WECOM_BOT_SECRET || 'ET185mpuG4jmdnoejSfE9vAiRJrvGVF72eaS5sPBTOj';
const TARGET_CHATID = process.env.WECOM_TARGET_CHATID || ''; // Group chatid, auto-discovered if empty

let wsClient = null;
let discoveredChatIds = new Set();
let connected = false;
let authenticated = false;
let lastFrameAt = null;
let lastHeartbeatAt = null;
let frameCount = 0;

// Helper to extract chatid from various frame locations
function extractChatId(frame) {
  if (!frame) return null;
  // Try multiple known locations
  return frame.chatid
      || frame.body?.chatid
      || frame.body?.chat?.chatid
      || frame.body?.from?.chatid
      || null;
}

function init() {
  if (wsClient) return wsClient;
  wsClient = new AiBot.WSClient({
    botId: BOT_ID,
    secret: BOT_SECRET,
  });

  wsClient.on('connected', () => {
    console.log('✅ [WeCom Bot] WebSocket connected');
    connected = true;
  });

  wsClient.on('authenticated', () => {
    console.log('🔐 [WeCom Bot] Authenticated, ready to send/receive');
    authenticated = true;
  });

  wsClient.on('disconnected', (reason) => {
    console.log('⚠️  [WeCom Bot] Disconnected:', reason, '- will auto-reconnect');
    connected = false;
    authenticated = false;
  });

  wsClient.on('error', (err) => {
    console.error('❌ [WeCom Bot] Error:', err.message || err);
  });

  // Catch any frame and capture chatid
  wsClient.on('message', (frame) => {
    const cid = extractChatId(frame);
    lastFrameAt = new Date().toISOString();
    frameCount++;
    console.log('📨 [WeCom Bot] message frame:', JSON.stringify({
      cid,
      keys: Object.keys(frame || {}),
      bodyKeys: frame?.body ? Object.keys(frame.body) : null,
      msgtype: frame?.body?.msgtype
    }).substring(0, 300));
    if (cid) discoveredChatIds.add(cid);
  });

  // Track ANY incoming frame
  wsClient.onAny((eventName, ...args) => {
    if (eventName.startsWith('message') || eventName.startsWith('event')) {
      lastFrameAt = new Date().toISOString();
    }
  });

  // Listen for heartbeat acks for health info
  wsClient.on('heartbeat_ack', () => {
    lastHeartbeatAt = new Date().toISOString();
  });

  // Handle text messages - reply and capture chatid
  wsClient.on('message.text', async (frame) => {
    const cid = extractChatId(frame);
    const text = frame?.body?.text?.content || '';
    console.log('💬 [WeCom Bot] Text from', cid, ':', text.substring(0, 50));
    if (cid) {
      discoveredChatIds.add(cid);
      // Reply to confirm
      try {
        await wsClient.reply(frame, {
          msgtype: 'markdown',
          markdown: { content: '👋 **厦门店开业助手已就绪！**\n\n我会在这里推送项目进度更新。\n\n> 📍 Chat ID: `' + cid + '`' }
        });
        console.log('✅ [WeCom Bot] Replied to group');
      } catch(e) {
        console.error('❌ [WeCom Bot] Reply failed:', e.message);
      }
    }
  });

  wsClient.on('event.enter_chat', (frame) => {
    const cid = extractChatId(frame);
    console.log('👋 [WeCom Bot] Enter chat:', cid);
    if (cid) discoveredChatIds.add(cid);
  });

  wsClient.on('event', (frame) => {
    const cid = extractChatId(frame);
    if (cid) discoveredChatIds.add(cid);
  });

  wsClient.connect();
  return wsClient;
}

async function sendNotification({ who, action, detail, tasks }) {
  if (!wsClient) init();
  if (!authenticated) {
    return { ok: false, reason: 'not_authenticated' };
  }

  const chatid = TARGET_CHATID || [...discoveredChatIds][0];
  if (!chatid) {
    return { ok: false, reason: 'no_chatid' };
  }

  const taskList = (tasks && tasks.length > 0)
    ? tasks.map(t => `> - ${t.title}${t.completed ? ' ✅' : ''}`).join('\n')
    : '';
  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const content = `## 🏪 厦门店进度更新\n**${who || '未署名'}** ${action || '更新了进度'}\n${detail || ''}\n${taskList}\n\n<font color="comment">${time}</font>`;

  try {
    await wsClient.sendMessage(chatid, {
      msgtype: 'markdown',
      markdown: { content },
    });
    console.log('📤 [WeCom Bot] Sent to', chatid);
    return { ok: true, chatid };
  } catch (e) {
    console.error('❌ [WeCom Bot] Send failed:', e.message || e);
    return { ok: false, reason: 'send_failed', error: e.message };
  }
}

function getStatus() {
  return {
    connected,
    authenticated,
    discoveredChatIds: [...discoveredChatIds],
    targetChatId: TARGET_CHATID || null,
    lastFrameAt,
    lastHeartbeatAt,
    frameCount,
    uptimeSeconds: Math.floor(process.uptime())
  };
}

module.exports = { init, sendNotification, getStatus };
