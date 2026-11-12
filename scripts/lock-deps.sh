#!/usr/bin/env bash
# backend/requirements.lock'u (hash'li) yeniden üretir. requirements.txt değişince çalıştır.
# Girdi: çalışan imajın pip freeze çıktısı (çözümleme döngüsünden kaçınır). Yavaş olabilir (hash indirir).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose build backend >/dev/null
docker compose run --rm --no-deps backend pip freeze 2>/dev/null | grep -v '^-e\| @ ' > /tmp/ia-freeze.txt
docker run --rm -v "$PWD/backend":/w -v /tmp/ia-freeze.txt:/f.txt:ro -w /w python:3.12-slim sh -c \
  "pip install -q pip-tools >/dev/null 2>&1; pip-compile --generate-hashes --allow-unsafe --no-annotate --no-header --strip-extras -q -o requirements.lock /f.txt"
