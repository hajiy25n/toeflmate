"""
Rename vocabulary category from 'BOB TOEFL' to '4월 1주차' for user 'hajiyeon'.
Uses same connection pattern as seed_vocab_hajiyeon.py.
"""
import os
import sys

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


def main():
    if not os.environ.get("TURSO_AUTH_TOKEN"):
        print("ERROR: TURSO_AUTH_TOKEN not set")
        sys.exit(1)

    db.init_db()
    conn = db.get_conn()

    # Get user id
    user_row = conn.execute(
        "SELECT id FROM users WHERE username='hajiyeon'"
    ).fetchone()
    if not user_row:
        print("ERROR: User 'hajiyeon' not found")
        sys.exit(1)
    user_id = user_row["id"]

    # Before counts
    before = conn.execute(
        "SELECT category, COUNT(*) as count FROM vocabulary WHERE user_id=? GROUP BY category ORDER BY category",
        (user_id,),
    ).fetchall()
    print("=== BEFORE ===")
    for r in before:
        print(f"  {r['category']}: {r['count']} words")

    # Rename
    conn.execute(
        "UPDATE vocabulary SET category = ? WHERE user_id = ? AND category = ?",
        ("4월 1주차", user_id, "BOB TOEFL"),
    )
    conn.commit()

    # After counts
    after = conn.execute(
        "SELECT category, COUNT(*) as count FROM vocabulary WHERE user_id=? GROUP BY category ORDER BY category",
        (user_id,),
    ).fetchall()
    print("\n=== AFTER ===")
    for r in after:
        print(f"  {r['category']}: {r['count']} words")

    print("\nDone.")


if __name__ == "__main__":
    main()
