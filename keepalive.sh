#!/bin/bash
cd /Users/a77/WorkBuddy/2026-07-24-09-28-42/xiamen-store
while true; do
  if ! curl -s -o /dev/null http://localhost:3000/api/stats 2>/dev/null; then
    pkill -9 -f "node server.js" 2>/dev/null
    sleep 1
    node server.js &
    echo "$(date '+%H:%M:%S') 服务器已重启"
  fi
  sleep 10
done
