#!/usr/bin/env bash
# Tek komutla testler (T-pre, IA D-04).
#   scripts/test.sh backend [pytest argümanları]   -> izole instaanalytic_pytest DB'sinde pytest
#   scripts/test.sh frontend                       -> tsc + vitest + build
#   scripts/test.sh                                -> ikisi birden
# Çalışan instaanalytic-* konteynerlerine dokunmaz: backend için tek kullanımlık bir konteyner
# (`compose run --rm`) açılır, dev bağımlılıkları yalnız orada kurulur. Gerçek veritabanına
# yazmaz: tests/conftest.py yalnız instaanalytic_pytest'i oluşturur ve siler.
set -euo pipefail
cd "$(dirname "$0")/.."

backend() {
  docker compose run --rm --no-deps -T backend sh -c \
    'pip install -q --disable-pip-version-check -r requirements-dev.txt && python -m pytest -q "$@"' sh "$@"
}

frontend() {
  (cd frontend && npx tsc --noEmit && npx vitest run && npm run build)
}

case "${1:-all}" in
  backend)  shift; backend "$@" ;;
  frontend) frontend ;;
  all)      backend; frontend ;;
  *) echo "kullanım: $0 [backend [pytest args]|frontend|all]" >&2; exit 2 ;;
esac
