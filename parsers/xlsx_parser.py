import pandas as pd

COLUMN_ALIASES = {
    "question": "prompt_text",
    "prompt": "prompt_text",
    "문제": "prompt_text",
    "질문": "prompt_text",
    "answer": "template_answer",
    "template": "template_answer",
    "답변": "template_answer",
    "템플릿": "template_answer",
    "정답": "template_answer",
    "type": "type",
    "유형": "type",
    "타입": "type",
    "topic": "topic",
    "주제": "topic",
    "sequence": "sequence",
    "순서": "sequence",
    "bullet_points": "bullet_points",
    "bullets": "bullet_points",
    "professor_prompt": "professor_prompt",
    "교수": "professor_prompt",
    "student_response_1": "student_response_1",
    "학생1": "student_response_1",
    "student_response_2": "student_response_2",
    "학생2": "student_response_2",
}


def parse_xlsx(file_path: str) -> list[dict]:
    df = pd.read_excel(file_path, engine="openpyxl")
    normalized = {}
    for col in df.columns:
        key = col.strip().lower().replace(" ", "_")
        mapped = COLUMN_ALIASES.get(key, key)
        normalized[col] = mapped
    df = df.rename(columns=normalized)

    required = ["prompt_text"]
    for r in required:
        if r not in df.columns:
            raise ValueError(f"필수 컬럼 '{r}'을 찾을 수 없습니다. 컬럼명을 확인해주세요.")

    df = df.where(pd.notna(df), None)
    rows = df.to_dict(orient="records")

    for row in rows:
        if not row.get("type"):
            row["type"] = "speaking_interview"
        row["prompt_text"] = str(row["prompt_text"]).strip() if row.get("prompt_text") else ""
        if row.get("template_answer"):
            row["template_answer"] = str(row["template_answer"]).strip()

    return rows
