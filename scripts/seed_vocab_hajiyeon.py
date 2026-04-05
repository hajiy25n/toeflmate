"""
Seed TOEFL vocabulary for the 'hajiyeon' user account only.
- Ensures user exists (creates with password '1234' if not)
- Loads 95 words from data/toefl_vocab_bob.json
- Skips words already present (idempotent)
"""
import os
import sys
import json
import sqlite3
from datetime import datetime

# Set env before importing db
os.environ["TURSO_DATABASE_URL"] = os.environ.get(
    "TURSO_DATABASE_URL",
    "libsql://toeflmate-hajiy25n.aws-ap-northeast-1.turso.io",
)
os.environ["TURSO_AUTH_TOKEN"] = os.environ.get(
    "TURSO_AUTH_TOKEN",
    "",
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import db  # noqa: E402
import bcrypt  # noqa: E402


def ensure_user(username: str, password: str) -> int:
    conn = db.get_conn()
    row = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    if row:
        print(f"✓ User '{username}' exists (id={row['id']})")
        return row["id"]

    # Create user
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    now = datetime.utcnow().isoformat()
    cur = conn.execute(
        "INSERT INTO users (username, password_hash, password_plain, created_at) VALUES (?, ?, ?, ?)",
        (username, pw_hash, password, now),
    )
    conn.commit()
    new_id = cur.lastrowid
    # Re-query (Turso may not return lastrowid reliably)
    if not new_id:
        row = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
        new_id = row["id"]
    print(f"✓ Created user '{username}' (id={new_id})")
    return new_id


def seed_vocab(user_id: int, words: list[dict]):
    conn = db.get_conn()

    # Get existing words for this user to skip duplicates
    existing = conn.execute(
        "SELECT word FROM vocabulary WHERE user_id=?", (user_id,)
    ).fetchall()
    existing_set = {r["word"].lower() for r in existing}

    inserted = 0
    skipped = 0
    now = datetime.utcnow().isoformat()

    for w in words:
        word = w["word"].strip()
        if word.lower() in existing_set:
            skipped += 1
            continue

        # Synonyms stored as JSON string
        syn_json = json.dumps(w.get("synonyms", []), ensure_ascii=False)

        conn.execute(
            """INSERT INTO vocabulary
               (user_id, category, word, part_of_speech, meaning, synonyms, example_sentence, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                "BOB TOEFL",  # category
                word,
                w.get("pos", ""),
                w.get("meaning", ""),
                syn_json,
                "",
                now,
            ),
        )
        inserted += 1

    conn.commit()
    print(f"✓ Inserted {inserted} words (skipped {skipped} duplicates)")


def main():
    if not os.environ.get("TURSO_AUTH_TOKEN"):
        print("ERROR: TURSO_AUTH_TOKEN not set")
        sys.exit(1)

    # Init schema
    db.init_db()
    print("✓ DB schema ready")

    # Ensure user
    user_id = ensure_user("hajiyeon", "1234")

    # Load words
    vocab_file = os.path.join(ROOT, "data", "toefl_vocab_bob.json")
    with open(vocab_file, "r", encoding="utf-8") as f:
        words = json.load(f)
    print(f"✓ Loaded {len(words)} words from {vocab_file}")

    # Seed
    seed_vocab(user_id, words)

    # Verify
    conn = db.get_conn()
    cnt = conn.execute(
        "SELECT COUNT(*) as c FROM vocabulary WHERE user_id=?", (user_id,)
    ).fetchone()
    print(f"✓ Total vocab for hajiyeon: {cnt['c']}")


if __name__ == "__main__":
    main()
