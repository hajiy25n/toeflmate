from docx import Document


def parse_docx(file_path: str, default_type: str = "speaking_interview") -> list[dict]:
    doc = Document(file_path)
    questions = []
    current = {}
    current_topic = ""

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        if para.style.name.startswith("Heading"):
            if current.get("prompt_text"):
                questions.append(current)
            current_topic = text
            current = {"topic": current_topic, "type": default_type}

        elif para.runs and para.runs[0].bold:
            if current.get("prompt_text"):
                questions.append(current)
                current = {"topic": current_topic, "type": default_type}
            current["prompt_text"] = text

        else:
            if current.get("prompt_text"):
                existing = current.get("template_answer", "")
                current["template_answer"] = (existing + "\n" + text).strip()
            else:
                current["prompt_text"] = text

    if current.get("prompt_text"):
        questions.append(current)

    return questions
