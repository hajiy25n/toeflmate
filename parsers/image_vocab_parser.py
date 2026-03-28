"""
Parse vocabulary images (like TOEFL vocab book pages) using OCR.
Handles rotated images and table-style layouts.
Extracts word, meaning, part_of_speech, synonyms, example_sentence.

Two OCR backends:
1. pytesseract (local, requires tesseract installed)
2. OCR.space free API (online fallback, no API key needed)
"""
import re
import os


def parse_vocab_image(image_path: str) -> list[dict]:
    """Main entry: try local tesseract first, fall back to online OCR."""
    # Try tesseract first
    words = _try_tesseract(image_path)
    if len(words) >= 2:
        return words

    # Fallback: OCR.space free API
    words = _try_ocr_space(image_path)
    if words:
        return words

    # If still nothing, return whatever tesseract got
    return words


def _try_tesseract(image_path: str) -> list[dict]:
    """Attempt OCR with local tesseract."""
    try:
        from PIL import Image, ImageEnhance, ImageFilter
        import pytesseract
    except ImportError:
        return []

    img = Image.open(image_path)

    # Preprocess: convert to RGB if needed
    if img.mode != "RGB":
        img = img.convert("RGB")

    best_words = []

    for rotation in [0, 90, 180, 270]:
        rotated = img.rotate(rotation, expand=True) if rotation else img.copy()

        # Try multiple preprocessing approaches
        for preprocess in ["none", "enhanced", "bw"]:
            processed = rotated.copy()
            if preprocess == "enhanced":
                # Increase contrast and sharpness
                processed = ImageEnhance.Contrast(processed).enhance(1.5)
                processed = ImageEnhance.Sharpness(processed).enhance(2.0)
            elif preprocess == "bw":
                # Convert to grayscale, threshold to B&W
                processed = processed.convert("L")
                processed = processed.point(lambda x: 0 if x < 140 else 255, "1")

            for psm in [6, 3, 4]:  # 6=block, 3=auto, 4=column
                try:
                    config = f"--psm {psm}"
                    text = pytesseract.image_to_string(processed, lang="kor+eng", config=config)
                    words = parse_vocab_text(text)
                    if len(words) > len(best_words):
                        best_words = words
                        if len(words) >= 3:
                            return words
                except Exception:
                    continue

    return best_words


def _try_ocr_space(image_path: str) -> list[dict]:
    """Fallback OCR using OCR.space free API."""
    try:
        import httpx
    except ImportError:
        return []

    try:
        with open(image_path, "rb") as f:
            file_data = f.read()

        ext = os.path.splitext(image_path)[1].lower()
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                "gif": "image/gif", "bmp": "image/bmp", "webp": "image/webp"}.get(ext.lstrip("."), "image/jpeg")

        import httpx
        best_words = []

        # Try multiple OCR engine settings
        for engine, lang in [("2", "kor"), ("1", "kor"), ("2", "eng")]:
            try:
                with httpx.Client(timeout=30.0) as client:
                    resp = client.post(
                        "https://api.ocr.space/parse/image",
                        files={"file": (os.path.basename(image_path), file_data, mime)},
                        data={
                            "apikey": "helloworld",
                            "language": lang,
                            "isOverlayRequired": "false",
                            "detectOrientation": "true",
                            "scale": "true",
                            "isTable": "true",
                            "OCREngine": engine,
                        },
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        results = data.get("ParsedResults", [])
                        if results:
                            text = results[0].get("ParsedText", "")
                            if text.strip():
                                words = parse_vocab_text(text)
                                if len(words) > len(best_words):
                                    best_words = words
                                    if len(words) >= 5:
                                        return words
            except Exception:
                continue

        return best_words
    except Exception:
        pass

    return []


def parse_vocab_text(text: str) -> list[dict]:
    """Parse OCR text into structured vocabulary entries."""
    words = []
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]

    current = None

    for line in lines:
        # Skip very short lines, pure separator lines
        if len(line) < 2:
            continue
        if re.match(r"^[-~—=_*#|]+$", line):
            continue
        # Skip common headers/footers
        if re.match(r"^(voca|TOEFL|BOB|TOEEL|TOEEI|page|\d+[-—]\d*[-—]?|[oO0°©®]+)$", line, re.IGNORECASE):
            continue
        if re.match(r"^[-—]\d+[-—]$", line):
            continue

        # Pattern: "27 Shed light on" or "27. Shed light on" or "27) Shed light on"
        num_match = re.match(r"^(\d{1,3})[.):\s]+(.+)", line)
        if num_match:
            word_text = num_match.group(2).strip()
            # Check if it's actually a word (not just a stray number line)
            if len(word_text) >= 2 and re.search(r"[A-Za-z]", word_text):
                if current and current.get("word"):
                    words.append(current)
                current = {
                    "word": word_text,
                    "meaning": "",
                    "part_of_speech": "",
                    "synonyms": "",
                    "example_sentence": "",
                }
                # Check if part of speech is in same line: "Shed light on (phrase)"
                pos_inline = re.search(r"\((\w+\.?(?:/\w+\.?)?)\)\s*$", word_text)
                if pos_inline:
                    current["part_of_speech"] = pos_inline.group(1)
                    current["word"] = word_text[:pos_inline.start()].strip()
                continue

        # Standalone word+POS line: "Shed light on (phrase)" without number
        word_pos_match = re.match(r"^([A-Z][a-zA-Z\s]+?)\s*\((\w+\.?(?:/\w+\.?)?)\)\s*$", line)
        if word_pos_match and not current:
            if current and current.get("word"):
                words.append(current)
            current = {
                "word": word_pos_match.group(1).strip(),
                "meaning": "",
                "part_of_speech": word_pos_match.group(2),
                "synonyms": "",
                "example_sentence": "",
            }
            continue

        if not current:
            # Try standalone English word (capitalized, not too long)
            if re.match(r"^[A-Z][a-zA-Z\s]{1,30}$", line):
                current = {
                    "word": line.strip(),
                    "meaning": "",
                    "part_of_speech": "",
                    "synonyms": "",
                    "example_sentence": "",
                }
            continue

        # Part of speech: "(n.)" or "n." or "(v./n.)" or "(adj.)" standalone
        pos_match = re.match(
            r"^\(?("
            r"n\.?(?:/[a-z]+\.?)?|v\.?(?:/[a-z]+\.?)?|adj\.?|adv\.?|"
            r"prep\.?|conj\.?|phrase|phr\.?"
            r")\)?\s*(.*)",
            line, re.IGNORECASE,
        )
        if pos_match and not current["part_of_speech"]:
            current["part_of_speech"] = pos_match.group(1).strip()
            rest = pos_match.group(2).strip()
            if rest and re.search(r"[가-힣]", rest):
                current["meaning"] = rest
            continue

        # Korean text → meaning
        if re.search(r"[가-힣]", line):
            # Check if line is mostly Korean (meaning) vs mixed (example translation)
            korean_ratio = len(re.findall(r"[가-힣]", line)) / max(len(line), 1)
            if current["meaning"] and current["example_sentence"] and korean_ratio > 0.3:
                # Korean translation of example - skip
                continue
            elif not current["meaning"]:
                current["meaning"] = line
            elif korean_ratio > 0.5 and len(line) > 25:
                # Long Korean line → example translation, skip
                continue
            else:
                if len(current["meaning"]) < 40:
                    current["meaning"] += ", " + line
            continue

        # Synonym patterns: comma-separated English words (at least 2 words with commas)
        if re.match(r"^[A-Z][a-z]+(?:\s+[a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s+[a-z]+)*)+$", line):
            if not current["synonyms"]:
                current["synonyms"] = line
            else:
                current["synonyms"] += ", " + line
            continue

        # Also catch: "Explain, Clarify, Illuminate" variations
        if "," in line and re.match(r"^[A-Za-z]", line) and len(line) < 80:
            comma_parts = [p.strip() for p in line.split(",")]
            if all(re.match(r"^[A-Za-z\s]+$", p) for p in comma_parts if p):
                if not current["synonyms"]:
                    current["synonyms"] = line
                else:
                    current["synonyms"] += ", " + line
                continue

        # Explicit synonym marker
        syn_match = re.match(r"^(?:=|syn[.:]\s*|synonym[s]?[.:]\s*)(.+)", line, re.IGNORECASE)
        if syn_match:
            current["synonyms"] = syn_match.group(1).strip()
            continue

        # English sentence (likely example) - starts with capital, has period
        if re.match(r"^[A-Z].*[.?!]$", line) and len(line) > 20:
            if not current["example_sentence"]:
                current["example_sentence"] = line
            continue

        # Remaining English text
        if re.match(r"^[A-Za-z]", line):
            if "," in line and len(line) < 60:
                if not current["synonyms"]:
                    current["synonyms"] = line
                else:
                    current["synonyms"] += ", " + line
            elif len(line) < 30 and not current["synonyms"]:
                current["synonyms"] = line

    if current and current.get("word"):
        words.append(current)

    # Clean up entries
    for w in words:
        w["word"] = re.sub(r"\s+", " ", w["word"]).strip()
        w["meaning"] = re.sub(r"\s+", " ", w["meaning"]).strip()
        w["synonyms"] = re.sub(r"\s+", " ", w["synonyms"]).strip().strip(", ")
        w["example_sentence"] = re.sub(r"\s+", " ", w.get("example_sentence", "")).strip()

    return [w for w in words if w["word"] and w["meaning"]]
