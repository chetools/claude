"""Deploy the API and the answer keys to Cloudflare (Worker 'seb-exams' + D1 database 'seb-exams').

    python deploy.py            # schema + answer keys from dist/*/key.json + Worker code (remote)
    python deploy.py --local    # the same into wrangler's local D1, for the test suite
    python deploy.py --keys     # only the answer keys (after editing an exam and rebuilding)

The teacher password is a Worker secret, set once with
    npx wrangler secret put TEACHER_PASSWORD   (run in worker/)
Credentials: wrangler reads CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID from the environment.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORKER = ROOT / "worker"
WRANGLER = ROOT / ".buildtools" / "node_modules" / ".bin" / "wrangler"


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def keys_sql():
    keys = sorted((ROOT / "dist").glob("*/key.json"))
    if not keys:
        sys.exit("deploy failed: no dist/*/key.json; run build.py first")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = []
    for f in keys:
        k = json.loads(f.read_text())
        rows.append(
            "INSERT INTO exams (id, title, page_url, key_json, config_keys, require_seb, updated_at) VALUES ("
            + ", ".join([q(k["id"]), q(k["title"]), q(k["page_url"]), q(json.dumps({"questions": k["questions"]})),
                         q(json.dumps(k["config_keys"])), str(int(k["require_seb"])), q(now)])
            + ") ON CONFLICT(id) DO UPDATE SET title=excluded.title, page_url=excluded.page_url, key_json=excluded.key_json,"
            " config_keys=excluded.config_keys, require_seb=excluded.require_seb, updated_at=excluded.updated_at;")
        print("answer key:", k["id"])
    return "\n".join(rows) + "\n"


def wrangler(*args):
    subprocess.run([str(WRANGLER), *args], cwd=WORKER, check=True)


def main(argv):
    where = "--local" if "--local" in argv else "--remote"
    if "--keys" not in argv:
        wrangler("d1", "execute", "seb-exams", where, "--file", "schema.sql")
    sql = WORKER / ".keys.sql"  # gitignored; holds answers
    sql.write_text(keys_sql())
    try:
        wrangler("d1", "execute", "seb-exams", where, "--file", sql.name)
    finally:
        sql.unlink()
    if where == "--remote" and "--keys" not in argv:
        wrangler("deploy")


if __name__ == "__main__":
    os.environ.setdefault("NODE_EXTRA_CA_CERTS", "/root/.ccr/ca-bundle.crt")
    main(sys.argv[1:])
