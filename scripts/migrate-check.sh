#!/usr/bin/env bash
# Alembic upgrade head -> downgrade -1 -> upgrade head kanıtı (T-pre).
# Yalnız geçici instaanalytic_migcheck veritabanında koşar (her seferinde silinip yeniden oluşturulur);
# gerçek instaanalytic veritabanına ve çalışan konteynerlere dokunmaz.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose run --rm --no-deps -T backend python - <<'PY'
import os, subprocess, sys
import psycopg2
from sqlalchemy.engine import make_url

DB = "instaanalytic_migcheck"
u = make_url(os.environ["DATABASE_URL"])
admin = psycopg2.connect(host=u.host, port=u.port or 5432, user=u.username, password=u.password, dbname=u.database)
admin.autocommit = True

def reset(drop_only=False):
    with admin.cursor() as c:
        c.execute(f'DROP DATABASE IF EXISTS "{DB}" WITH (FORCE)')
        if not drop_only:
            c.execute(f'CREATE DATABASE "{DB}"')

env = dict(os.environ, DATABASE_URL=u.set(database=DB).render_as_string(hide_password=False))
ok = True
try:
    reset()
    for step in (["upgrade", "head"], ["current"], ["downgrade", "-1"], ["current"], ["upgrade", "head"], ["current"]):
        print("$ alembic", *step, flush=True)
        r = subprocess.run(["alembic", *step], env=env)
        if r.returncode:
            ok = False
            break
finally:
    reset(drop_only=True)
    admin.close()
print("SONUC:", "up/down/up TAMAM" if ok else "BASARISIZ")
sys.exit(0 if ok else 1)
PY
