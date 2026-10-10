#!/usr/bin/env bash
# نُور — سيرفر محلي (ماك / لينكس)
set -e
cd "$(dirname "$0")"
echo "جارٍ تشغيل نُور..."
node "$(dirname "$0")/server.js"
