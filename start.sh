#!/bin/bash
cd /Users/a77/WorkBuddy/2026-07-24-09-28-42/xiamen-store
pkill -9 -f "node server.js" 2>/dev/null
sleep 1
node server.js &
sleep 2
echo "服务器已启动 → http://localhost:3000"
