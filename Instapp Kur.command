#!/bin/bash
# Instapp Kurulum — Bu dosyaya çift tıklayarak kurulum yapabilirsiniz.
cd "$(dirname "$0")"
bash start.sh
echo ""
echo "Bu pencereyi kapatabilirsiniz."
read -rp "Kapatmak için Enter'a basın…"
