import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "toefl_db.sqlite")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            type TEXT NOT NULL,
            topic TEXT,
            sequence INTEGER,
            prompt_text TEXT NOT NULL,
            bullet_points TEXT,
            professor_prompt TEXT,
            student_response_1 TEXT,
            student_response_2 TEXT,
            template_answer TEXT,
            source_file TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            type TEXT NOT NULL,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS session_questions (
            session_id INTEGER REFERENCES sessions(id),
            question_id INTEGER REFERENCES questions(id),
            user_response TEXT,
            elapsed_seconds INTEGER,
            word_count INTEGER,
            PRIMARY KEY (session_id, question_id)
        );

        CREATE TABLE IF NOT EXISTS question_history (
            user_id INTEGER,
            question_id INTEGER,
            times_seen INTEGER DEFAULT 0,
            last_seen_at TIMESTAMP,
            PRIMARY KEY (user_id, question_id)
        );

        CREATE TABLE IF NOT EXISTS auth_sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    conn.close()


SAMPLE_QUESTIONS = [
    {
        "type": "speaking_interview",
        "topic": "communication",
        "sequence": 1,
        "prompt_text": "Thank you for joining our study on communication. To begin, do you enjoy meeting new people in your daily life? Why or why not?",
        "template_answer": "Yes, I do. I enjoy meeting new people because I can interact with many different people. It gives me a great chance to socialize with others and broaden my relationships. I remember when I was 20, I had a chance to take a trip to Texas. I really enjoyed having small talks with strangers and mingling with new people that I had never met.",
    },
    {
        "type": "writing_discussion",
        "topic": "financial literacy",
        "prompt_text": "In your opinion, do you think it is necessary for young people to learn how to manage money at a young age? Why or why not?",
        "template_answer": "From my perspective, both made excellent statements, but I'm on the same page as April. Simply put, managing money at a young age allows people to have a bright/secure financial future. This is mainly because, under the capitalistic creed, money holds power which enables people to afford almost everything. Without the ability to manage money properly, people would not be able to enjoy many aspects, leading to less satisfaction with their lives. A perfect example of this is my cousin, who is poor at managing money. Due to this, he is living on a tight budget, and unable to afford his living costs. In addition, loans worry him about how to pay back. Unfortunately, with the current soaring prices of staple products, it is practically impossible for him to obtain what he needs. If he had learned how to manage money from anyone at a young age, he wouldn't have suffered financially.",
    },
]


def seed_sample_questions(user_id: int):
    conn = get_conn()
    for q in SAMPLE_QUESTIONS:
        existing = conn.execute(
            "SELECT id FROM questions WHERE user_id=? AND type=? AND prompt_text=?",
            (user_id, q["type"], q["prompt_text"]),
        ).fetchone()
        if not existing:
            conn.execute(
                """INSERT INTO questions (user_id, type, topic, sequence, prompt_text, template_answer)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (user_id, q["type"], q.get("topic"), q.get("sequence"),
                 q["prompt_text"], q["template_answer"]),
            )
    conn.commit()
    conn.close()


# --- CRUD helpers ---

def get_questions(user_id: int, qtype: str = None):
    conn = get_conn()
    if qtype:
        rows = conn.execute(
            "SELECT * FROM questions WHERE user_id=? AND type=? ORDER BY created_at",
            (user_id, qtype),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM questions WHERE user_id=? ORDER BY type, created_at",
            (user_id,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def add_questions(user_id: int, questions: list[dict]):
    conn = get_conn()
    ids = []
    for q in questions:
        cur = conn.execute(
            """INSERT INTO questions
               (user_id, type, topic, sequence, prompt_text, bullet_points,
                professor_prompt, student_response_1, student_response_2,
                template_answer, source_file)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, q["type"], q.get("topic"), q.get("sequence"),
             q["prompt_text"], q.get("bullet_points"),
             q.get("professor_prompt"), q.get("student_response_1"),
             q.get("student_response_2"), q.get("template_answer"),
             q.get("source_file")),
        )
        ids.append(cur.lastrowid)
    conn.commit()
    conn.close()
    return ids


def update_question(user_id: int, question_id: int, data: dict) -> bool:
    conn = get_conn()
    fields = []
    values = []
    for key in ("type", "topic", "sequence", "prompt_text", "bullet_points",
                "professor_prompt", "student_response_1", "student_response_2",
                "template_answer"):
        if key in data:
            fields.append(f"{key} = ?")
            values.append(data[key])
    if not fields:
        conn.close()
        return False
    values.extend([question_id, user_id])
    cur = conn.execute(
        f"UPDATE questions SET {', '.join(fields)} WHERE id = ? AND user_id = ?",
        values,
    )
    conn.commit()
    ok = cur.rowcount > 0
    conn.close()
    return ok


def get_question(user_id: int, question_id: int):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM questions WHERE id=? AND user_id=?",
        (question_id, user_id),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_question(user_id: int, question_id: int) -> bool:
    conn = get_conn()
    cur = conn.execute(
        "DELETE FROM questions WHERE id=? AND user_id=?",
        (question_id, user_id),
    )
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def pick_next_question(user_id: int, qtype: str, exclude_ids: list[int]):
    conn = get_conn()
    placeholders = ",".join("?" for _ in exclude_ids) if exclude_ids else "0"
    row = conn.execute(
        f"""SELECT q.* FROM questions q
            LEFT JOIN question_history h ON h.question_id = q.id AND h.user_id = ?
            WHERE q.user_id = ? AND q.type = ? AND q.id NOT IN ({placeholders})
            ORDER BY COALESCE(h.times_seen, 0) ASC,
                     COALESCE(h.last_seen_at, '1970-01-01') ASC,
                     RANDOM()
            LIMIT 1""",
        (user_id, user_id, qtype, *exclude_ids),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def record_question_seen(user_id: int, question_id: int):
    conn = get_conn()
    now = datetime.utcnow().isoformat()
    conn.execute(
        """INSERT INTO question_history (user_id, question_id, times_seen, last_seen_at)
           VALUES (?, ?, 1, ?)
           ON CONFLICT(user_id, question_id)
           DO UPDATE SET times_seen = times_seen + 1, last_seen_at = ?""",
        (user_id, question_id, now, now),
    )
    conn.commit()
    conn.close()


def create_session(user_id: int, qtype: str) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO sessions (user_id, type) VALUES (?, ?)",
        (user_id, qtype),
    )
    conn.commit()
    session_id = cur.lastrowid
    conn.close()
    return session_id


def save_session_question(session_id: int, question_id: int,
                          user_response: str = None,
                          elapsed_seconds: int = None,
                          word_count: int = None):
    conn = get_conn()
    conn.execute(
        """INSERT OR REPLACE INTO session_questions
           (session_id, question_id, user_response, elapsed_seconds, word_count)
           VALUES (?, ?, ?, ?, ?)""",
        (session_id, question_id, user_response, elapsed_seconds, word_count),
    )
    conn.commit()
    conn.close()
