import uuid
import bcrypt
from db import get_conn, seed_sample_questions, cache_session, get_cached_session, invalidate_session


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _save_session(token: str, user_id: int):
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO auth_sessions (token, user_id) VALUES (?, ?)",
        (token, user_id),
    )
    conn.commit()
    conn.close()
    cache_session(token, user_id)


def register(username: str, password: str) -> dict:
    if len(username) < 2:
        return {"ok": False, "error": "아이디는 2자 이상이어야 합니다."}
    if len(password) < 4:
        return {"ok": False, "error": "비밀번호는 4자 이상이어야 합니다."}

    conn = get_conn()
    existing = conn.execute(
        "SELECT id FROM users WHERE username=?", (username,)
    ).fetchone()
    if existing:
        conn.close()
        return {"ok": False, "error": "이미 존재하는 아이디입니다."}

    pw_hash = hash_password(password)
    cur = conn.execute(
        "INSERT INTO users (username, password_hash, password_plain) VALUES (?, ?, ?)",
        (username, pw_hash, password),
    )
    conn.commit()
    user_id = cur.lastrowid
    conn.close()

    seed_sample_questions(user_id)

    token = str(uuid.uuid4())
    _save_session(token, user_id)
    return {"ok": True, "token": token, "user_id": user_id, "username": username}


def login(username: str, password: str) -> dict:
    conn = get_conn()
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username=?", (username,)
    ).fetchone()
    conn.close()

    if not row or not verify_password(password, row["password_hash"]):
        return {"ok": False, "error": "아이디 또는 비밀번호가 틀렸습니다."}

    token = str(uuid.uuid4())
    _save_session(token, row["id"])
    return {"ok": True, "token": token, "user_id": row["id"], "username": username}


def get_user_id(token: str) -> int | None:
    if not token:
        return None
    # Check in-memory cache first (avoids DB lookup)
    cached = get_cached_session(token)
    if cached is not None:
        return cached
    conn = get_conn()
    row = conn.execute(
        "SELECT user_id FROM auth_sessions WHERE token=?", (token,)
    ).fetchone()
    conn.close()
    if row:
        cache_session(token, row["user_id"])
        return row["user_id"]
    return None


def recover_password(username: str) -> dict:
    conn = get_conn()
    row = conn.execute(
        "SELECT password_plain FROM users WHERE username=?", (username,)
    ).fetchone()
    conn.close()
    if not row:
        return {"ok": False, "error": "존재하지 않는 아이디입니다."}
    pw = row["password_plain"]
    if not pw:
        return {"ok": False, "error": "비밀번호 복구 정보가 없습니다. (이전 가입 계정)"}
    return {"ok": True, "password": pw}


def get_user_profile(user_id: int) -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT id, username, password_plain, created_at FROM users WHERE id=?", (user_id,)
    ).fetchone()
    conn.close()
    if not row:
        return None
    return {
        "user_id": row["id"],
        "username": row["username"],
        "password": row["password_plain"] or "***",
        "created_at": row["created_at"],
    }


def logout(token: str):
    invalidate_session(token)
    conn = get_conn()
    conn.execute("DELETE FROM auth_sessions WHERE token=?", (token,))
    conn.commit()
    conn.close()
