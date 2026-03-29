import os
import json
import tempfile
import hashlib
import httpx
import edge_tts
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
import db
import auth

TTS_CACHE_DIR = os.path.join(os.path.dirname(__file__), ".tts_cache")
os.makedirs(TTS_CACHE_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app):
    db.init_db()
    yield

app = FastAPI(title="토플메이트", lifespan=lifespan)

BASE_DIR = os.path.dirname(__file__)
STATIC_DIR = os.path.join(BASE_DIR, "static")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")


# --- Auth helpers ---

def require_auth(request: Request) -> int:
    token = request.cookies.get("session_token")
    if not token:
        raise HTTPException(401, "로그인이 필요합니다.")
    user_id = auth.get_user_id(token)
    if not user_id:
        raise HTTPException(401, "세션이 만료되었습니다.")
    return user_id


# --- Auth endpoints ---

@app.post("/api/register")
async def api_register(request: Request):
    body = await request.json()
    result = auth.register(body.get("username", ""), body.get("password", ""))
    if not result["ok"]:
        return JSONResponse(result, status_code=400)
    resp = JSONResponse(result)
    resp.set_cookie("session_token", result["token"], httponly=True, samesite="lax", max_age=86400 * 30)
    return resp


@app.post("/api/login")
async def api_login(request: Request):
    body = await request.json()
    result = auth.login(body.get("username", ""), body.get("password", ""))
    if not result["ok"]:
        return JSONResponse(result, status_code=400)
    resp = JSONResponse(result)
    resp.set_cookie("session_token", result["token"], httponly=True, samesite="lax", max_age=86400 * 30)
    return resp


@app.post("/api/logout")
async def api_logout(request: Request):
    token = request.cookies.get("session_token")
    if token:
        auth.logout(token)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("session_token")
    return resp


@app.get("/api/me")
async def api_me(request: Request):
    token = request.cookies.get("session_token")
    if not token:
        return JSONResponse({"ok": False}, status_code=401)
    user_id = auth.get_user_id(token)
    if not user_id:
        return JSONResponse({"ok": False}, status_code=401)
    conn = db.get_conn()
    row = conn.execute("SELECT id, username FROM users WHERE id=?", (user_id,)).fetchone()
    conn.close()
    if not row:
        return JSONResponse({"ok": False}, status_code=401)
    return {"ok": True, "user_id": row["id"], "username": row["username"]}


@app.post("/api/recover-password")
async def api_recover_password(request: Request):
    body = await request.json()
    result = auth.recover_password(body.get("username", ""))
    if not result["ok"]:
        return JSONResponse(result, status_code=400)
    return result


@app.get("/api/profile")
async def api_profile(request: Request):
    user_id = require_auth(request)
    profile = auth.get_user_profile(user_id)
    if not profile:
        raise HTTPException(404)
    return profile


# --- Dictionary/Vocab endpoints disabled (단어장 비활성화) ---


# --- Questions endpoints ---

@app.get("/api/questions")
async def api_questions(request: Request, type: str = None):
    user_id = require_auth(request)
    return db.get_questions(user_id, type)


@app.post("/api/questions")
async def api_add_questions(request: Request):
    user_id = require_auth(request)
    body = await request.json()
    questions = body if isinstance(body, list) else [body]
    ids = db.add_questions(user_id, questions)
    return {"ok": True, "ids": ids}


@app.get("/api/questions/{question_id}")
async def api_get_question(question_id: int, request: Request):
    user_id = require_auth(request)
    q = db.get_question(user_id, question_id)
    if not q:
        raise HTTPException(404, "문제를 찾을 수 없습니다.")
    return q


@app.put("/api/questions/{question_id}")
async def api_update_question(question_id: int, request: Request):
    user_id = require_auth(request)
    body = await request.json()
    ok = db.update_question(user_id, question_id, body)
    if not ok:
        raise HTTPException(404, "문제를 찾을 수 없거나 변경할 내용이 없습니다.")
    return {"ok": True}


@app.delete("/api/questions/{question_id}")
async def api_delete_question(question_id: int, request: Request):
    user_id = require_auth(request)
    ok = db.delete_question(user_id, question_id)
    if not ok:
        raise HTTPException(404, "문제를 찾을 수 없습니다.")
    return {"ok": True}


# --- Practice session endpoints ---

@app.post("/api/sessions")
async def api_create_session(request: Request):
    user_id = require_auth(request)
    body = await request.json()
    session_id = db.create_session(user_id, body["type"])
    return {"ok": True, "session_id": session_id}


@app.post("/api/sessions/{session_id}/questions")
async def api_save_session_question(session_id: int, request: Request):
    require_auth(request)
    body = await request.json()
    db.save_session_question(
        session_id, body["question_id"],
        body.get("user_response"), body.get("elapsed_seconds"), body.get("word_count"),
    )
    return {"ok": True}


@app.get("/api/next-question")
async def api_next_question(request: Request, type: str, exclude: str = ""):
    user_id = require_auth(request)
    exclude_ids = [int(x) for x in exclude.split(",") if x.strip()]
    question = db.pick_next_question(user_id, type, exclude_ids)
    if not question:
        return {"ok": False, "error": "더 이상 문제가 없습니다."}
    db.record_question_seen(user_id, question["id"])
    return {"ok": True, "question": question}


# --- File import endpoints ---

@app.post("/api/import/xlsx")
async def api_import_xlsx(request: Request, file: UploadFile = File(...)):
    user_id = require_auth(request)
    from parsers.xlsx_parser import parse_xlsx
    tmp = os.path.join(UPLOAD_DIR, file.filename)
    with open(tmp, "wb") as f:
        f.write(await file.read())
    try:
        rows = parse_xlsx(tmp)
        return {"ok": True, "rows": rows, "filename": file.filename}
    finally:
        os.remove(tmp)


@app.post("/api/import/docx")
async def api_import_docx(request: Request, file: UploadFile = File(...)):
    user_id = require_auth(request)
    from parsers.docx_parser import parse_docx
    tmp = os.path.join(UPLOAD_DIR, file.filename)
    with open(tmp, "wb") as f:
        f.write(await file.read())
    try:
        rows = parse_docx(tmp)
        return {"ok": True, "rows": rows, "filename": file.filename}
    finally:
        os.remove(tmp)


@app.post("/api/import/confirm")
async def api_import_confirm(request: Request):
    user_id = require_auth(request)
    body = await request.json()
    questions = body.get("questions", [])
    for q in questions:
        q["source_file"] = body.get("filename", "")
    ids = db.add_questions(user_id, questions)
    return {"ok": True, "ids": ids, "count": len(ids)}


# --- Vocabulary endpoints (비활성화 - 단어장 기능 제거) ---
# vocab 관련 엔드포인트 주석처리. 파일은 보존.


# --- TTS endpoint (Microsoft Neural Voice) ---

@app.post("/api/tts")
async def api_tts(request: Request):
    body = await request.json()
    text = body.get("text", "").strip()
    voice = body.get("voice", "en-US-AvaMultilingualNeural")
    if not text:
        raise HTTPException(400, "text is required")

    # Cache by text+voice hash
    key = hashlib.md5(f"{voice}:{text}".encode()).hexdigest()
    cache_path = os.path.join(TTS_CACHE_DIR, f"{key}.mp3")

    if not os.path.exists(cache_path):
        communicate = edge_tts.Communicate(text, voice, rate="-5%")
        await communicate.save(cache_path)

    return FileResponse(cache_path, media_type="audio/mpeg")


# --- Static files ---

@app.get("/")
async def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
