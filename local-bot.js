#!/usr/bin/env node
// 杭州2店企微群通知 - 本地版
// 用法: node local-bot.js
// 说明: 连接企微智能机器人，轮询 Render 进度变化，检测到更新时自动推送群消息
const AiBot = require('@wecom/aibot-node-sdk');
const https = require('https');

const BOT_ID = 'aibAyCsZCdFVRJXIMYKtC0HxhJSRSdoTTFG';
const BOT_SECRET = 'ET185mpuG4jmdnoejSfE9vAiRJrvGVF72eaS5sPBTOj';
const API_URL = 'https://hangzhou2-store.onrender.com/api/version';
const POLL_INTERVAL = 60 * 1000; // 每 60 秒轮询一次

let lastVersion = 0;
let lastUpdater = '';
let chatId = null;
let wsClient = null;

// ======= 轮询 Render 进度 =======
function fetchVersion() {
  return new Promise((resolve, reject) => {
    https.get(API_URL, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function pollProgress() {
  try {
    const info = await fetchVersion();
    if (info.version > lastVersion) {
      console.log(`📡 检测到更新: v${lastVersion} → v${info.version} (by ${info.updated_by})`);
      lastVersion = info.version;
      lastUpdater = info.updated_by;
      await sendSummary(info.updated_by);
    }
  } catch(e) {
    // 静默跳过（Render 可能休眠）
  }
}

async function sendSummary(who) {
  if (!chatId) {
    console.log('⏳ 尚未获取群 chatId，请在群里 @qiqi小助理');
    return;
  }
  try {
    const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    await wsClient.sendMessage(chatId, {
      msgtype: 'markdown',
      markdown: { content: `## 🏪 杭州2店进度更新\n**${who || '有人'}** 更新了任务状态\n\n> 📍 查看详情: https://hangzhou2-store.onrender.com\n\n<font color="comment">${time}</font>` }
    });
    console.log(`📤 已发送到群 (${chatId.substring(0, 12)}...)`);
  } catch(e) {
    console.error('❌ 发送失败:', e.message);
  }
}

// ======= 企微 Bot 连接 =======
function connectBot() {
  wsClient = new AiBot.WSClient({ botId: BOT_ID, secret: BOT_SECRET });

  wsClient.on('connected', () => console.log('✅ WebSocket 已连接'));
  
  wsClient.on('authenticated', () => {
    console.log('🔐 认证成功！请在群里 @qiqi小助理 发一条消息');
    // 开始轮询
    fetchVersion().then(info => {
      lastVersion = info.version || 0;
      lastUpdater = info.updated_by || '';
      console.log(`📊 当前版本: v${lastVersion}`);
    }).catch(() => {});
    setInterval(pollProgress, POLL_INTERVAL);
  });

  wsClient.on('disconnected', () => console.log('⚠️ 断开连接，自动重连中…'));

  wsClient.on('error', (err) => console.error('❌ 错误:', err.message));

  // 收到消息时捕获 chatId 并回复
  wsClient.on('message.text', async (frame) => {
    const cid = frame?.body?.chat?.chatid || frame?.chatid || frame?.body?.chatid;
    if (cid) {
      chatId = cid;
      console.log(`📨 获取到群 chatId: ${cid}`);
      try {
        await wsClient.reply(frame, {
          msgtype: 'markdown',
          markdown: { content: '👋 **杭州2店开业助手已上线！**\n\n我会在有人更新进度时，自动推送通知到这个群。' }
        });
        console.log('✅ 已回复确认');
      } catch(e) {
        console.error('回复失败:', e.message);
      }
    }
  });

  wsClient.on('message', (frame) => {
    const cid = frame?.body?.chat?.chatid || frame?.chatid || frame?.body?.chatid;
    if (cid && !chatId) {
      chatId = cid;
      console.log(`📨 捕获 chatId: ${cid}`);
    }
  });

  wsClient.connect();
}

// ======= 启动 =======
console.log('🚀 杭州2店企微通知机器人启动中…');
console.log('   Bot ID:', BOT_ID.substring(0, 16) + '…');
connectBot();

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n👋 已停止');
  if (wsClient) wsClient.disconnect();
  process.exit(0);
});
