"""
Parse vocabulary images (TOEFL vocab book pages) using OCR.
Uses OCR.space API with spatial/overlay analysis for table layouts.
Falls back to tesseract if available.
"""
import re
import os


def parse_vocab_image(image_path: str) -> list[dict]:
    """Main entry: fix EXIF, then try OCR.space (overlay), then tesseract."""
    from PIL import Image, ImageOps

    img = Image.open(image_path)
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Resize if too large (OCR.space free has 1MB limit)
    w, h = img.size
    if w > 2000 or h > 2000:
        ratio = min(2000 / w, 2000 / h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    fixed_path = image_path + ".fixed.jpg"
    img.save(fixed_path, "JPEG", quality=85)

    try:
        # Try OCR.space with overlay (spatial parsing for tables)
        words = _try_ocr_space_overlay(fixed_path)
        if len(words) >= 2:
            return words

        # Try rotated 90° (landscape phone photo)
        rotated = img.rotate(90, expand=True)
        rot_path = image_path + ".rot.jpg"
        rotated.save(rot_path, "JPEG", quality=85)
        try:
            words = _try_ocr_space_overlay(rot_path)
            if len(words) >= 2:
                return words
        finally:
            _safe_remove(rot_path)

        # Fallback: tesseract
        words = _try_tesseract(fixed_path, img)
        if len(words) >= 2:
            return words

        return words
    finally:
        _safe_remove(fixed_path)


def _try_ocr_space_overlay(image_path: str) -> list[dict]:
    """OCR.space with overlay data for spatial table reconstruction."""
    try:
        import httpx
    except ImportError:
        return []

    with open(image_path, "rb") as f:
        file_data = f.read()

    fname = os.path.basename(image_path)
    best_words = []

    for engine in ["2", "1"]:
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    "https://api.ocr.space/parse/image",
                    files={"file": (fname, file_data, "image/jpeg")},
                    data={
                        "apikey": "helloworld",
                        "language": "kor",
                        "isOverlayRequired": "true",
                        "detectOrientation": "true",
                        "scale": "true",
                        "isTable": "true",
                        "OCREngine": engine,
                    },
                )
                if resp.status_code != 200:
                    continue
                data = resp.json()
                results = data.get("ParsedResults", [])
                if not results:
                    continue

                # Try spatial parsing from overlay
                overlay = results[0].get("TextOverlay", {})
                if overlay and overlay.get("Lines"):
                    words = _parse_overlay_spatial(overlay)
                    if len(words) > len(best_words):
                        best_words = words
                        if len(words) >= 5:
                            return words

                # Fallback: plain text
                text = results[0].get("ParsedText", "")
                if text.strip():
                    words = _parse_plain_text(text)
                    if len(words) > len(best_words):
                        best_words = words
                        if len(words) >= 5:
                            return words
        except Exception as e:
            print(f"[OCR] OCR.space engine {engine} error: {e}")
            continue

    return best_words


def _parse_overlay_spatial(overlay: dict) -> list[dict]:
    """
    Parse OCR.space overlay using word positions to reconstruct table columns.
    Vocab book table: Number | English Word | (POS) | Korean Meaning | Synonyms
    """
    lines = overlay.get("Lines", [])
    if not lines:
        return []

    # Collect all words with bounding boxes
    all_words = []
    for line in lines:
        for word_info in line.get("Words", []):
            text = word_info.get("WordText", "").strip()
            if not text:
                continue
            left = word_info.get("Left", 0)
            top = word_info.get("Top", 0)
            width = word_info.get("Width", 0)
            height = word_info.get("Height", 0)
            cy = top + height / 2
            all_words.append({
                "text": text,
                "left": left,
                "top": top,
                "cy": cy,
                "width": width,
                "height": height,
            })

    if not all_words:
        return []

    # Sort by vertical position
    all_words.sort(key=lambda w: w["cy"])

    # Group into rows (words at similar Y)
    median_h = sorted(w["height"] for w in all_words if w["height"] > 0)[len(all_words) // 2] if all_words else 15
    threshold = max(median_h * 0.7, 8)

    rows = []
    current_row = [all_words[0]]
    for w in all_words[1:]:
        if abs(w["cy"] - current_row[-1]["cy"]) < threshold:
            current_row.append(w)
        else:
            rows.append(current_row)
            current_row = [w]
    rows.append(current_row)

    # Sort each row left-to-right
    for row in rows:
        row.sort(key=lambda w: w["left"])

    # Now identify columns by analyzing X positions across all rows
    # Find rows that start with a number (entry rows)
    entries = []
    current = None

    for row in rows:
        row_text = " ".join(w["text"] for w in row)

        # Skip noise
        if len(row_text.strip()) < 2:
            continue
        if re.search(r"(TOEFL|voca|BOB|page\s*\d+|vocabulary)", row_text, re.IGNORECASE):
            continue
        if re.match(r"^[-~—=_*#|]+$", row_text.strip()):
            continue

        # Separate words into categories by content
        eng_words = []
        kor_words = []
        num_prefix = None
        pos_text = ""

        for w in row:
            t = w["text"].strip()
            if not t:
                continue

            # Number at very start
            if num_prefix is None and re.match(r"^\d{1,3}[.)]*$", t):
                num_prefix = t
                continue

            # POS in parentheses
            pos_match = re.match(r"^\(?(?:n|v|adj|adv|prep|conj|phr|phrase)\.?(?:/(?:n|v|adj|adv)\.?)?\)?$", t, re.IGNORECASE)
            if pos_match:
                pos_text = t.strip("()")
                continue

            has_kor = bool(re.search(r"[가-힣]", t))
            has_eng = bool(re.search(r"[A-Za-z]{2,}", t))

            if has_kor:
                kor_words.append(t)
            elif has_eng:
                eng_words.append(t)
            elif re.match(r"^[~=,.:;/]+$", t):
                continue  # punctuation
            else:
                # Mixed or unclear - check ratio
                kor_chars = len(re.findall(r"[가-힣]", t))
                eng_chars = len(re.findall(r"[A-Za-z]", t))
                if kor_chars > eng_chars:
                    kor_words.append(t)
                elif eng_chars > 0:
                    eng_words.append(t)

        # Decide if this is a new entry or continuation
        if num_prefix and eng_words:
            # New numbered entry
            if current and current.get("word"):
                entries.append(current)
            current = {
                "word": " ".join(eng_words),
                "meaning": " ".join(kor_words),
                "part_of_speech": pos_text,
                "synonyms": "",
                "example_sentence": "",
            }
        elif current:
            # Continuation of previous entry
            if kor_words and not current["meaning"]:
                current["meaning"] = " ".join(kor_words)
            elif kor_words and current["meaning"]:
                # Could be additional meaning line
                current["meaning"] += ", " + " ".join(kor_words)

            if eng_words:
                # Check if these are synonyms (= prefix or comma-separated)
                eng_text = " ".join(eng_words)
                if re.match(r"^[=]\s*", eng_text) or (current["meaning"] and not current["synonyms"]):
                    syn = re.sub(r"^[=]\s*", "", eng_text)
                    if not current["synonyms"]:
                        current["synonyms"] = syn
                    else:
                        current["synonyms"] += ", " + syn
                elif not current["word"]:
                    current["word"] = eng_text

            if pos_text and not current["part_of_speech"]:
                current["part_of_speech"] = pos_text
        else:
            # No current entry, start one if we have English text
            if eng_words:
                current = {
                    "word": " ".join(eng_words),
                    "meaning": " ".join(kor_words),
                    "part_of_speech": pos_text,
                    "synonyms": "",
                    "example_sentence": "",
                }

    if current and current.get("word"):
        entries.append(current)

    return _quality_filter(entries)


def _try_tesseract(image_path: str, img) -> list[dict]:
    """Fallback OCR with local tesseract."""
    try:
        import pytesseract
    except ImportError:
        return []

    best_words = []
    for rotation in [0, 90]:
        rotated = img.rotate(rotation, expand=True) if rotation else img
        for psm in [6, 3]:
            try:
                text = pytesseract.image_to_string(
                    rotated, lang="kor+eng",
                    config=f"--psm {psm} --oem 3"
                )
                words = _parse_plain_text(text)
                if len(words) > len(best_words):
                    best_words = words
                    if len(words) >= 5:
                        return words
            except Exception:
                continue
    return best_words


def _parse_plain_text(text: str) -> list[dict]:
    """Parse plain OCR text line-by-line into vocab entries."""
    words = []
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    current = None

    for line in lines:
        if len(line) < 2:
            continue
        if re.match(r"^[-~—=_*#|]+$", line):
            continue
        if re.search(r"(TOEFL|voca|BOB|page\s*\d+|vocabulary)", line, re.IGNORECASE):
            continue

        # Numbered entry: "27 Shed light on" or "27. Shed light on (phr.)"
        num_match = re.match(r"^(\d{1,3})[.):\s]+(.+)", line)
        if num_match:
            rest = num_match.group(2).strip()
            if len(rest) >= 2 and re.search(r"[A-Za-z]", rest):
                if current and current.get("word"):
                    words.append(current)

                # Extract POS if inline
                pos = ""
                pos_m = re.search(r"\((\w+\.?(?:/\w+\.?)?)\)\s*$", rest)
                if pos_m and re.match(r"^(n|v|adj|adv|prep|conj|phrase|phr)", pos_m.group(1), re.IGNORECASE):
                    pos = pos_m.group(1)
                    rest = rest[:pos_m.start()].strip()

                # Split Korean from English
                kor_m = re.search(r"[가-힣]", rest)
                if kor_m:
                    eng = rest[:kor_m.start()].strip()
                    kor = rest[kor_m.start():].strip()
                else:
                    eng = rest
                    kor = ""

                current = {
                    "word": eng, "meaning": kor, "part_of_speech": pos,
                    "synonyms": "", "example_sentence": "",
                }
                continue

        if not current:
            if re.match(r"^[A-Z][a-zA-Z\s]{1,30}$", line):
                current = {"word": line.strip(), "meaning": "", "part_of_speech": "", "synonyms": "", "example_sentence": ""}
            continue

        # POS line
        pos_match = re.match(
            r"^\(?(n\.?(?:/\w+\.?)?|v\.?(?:/\w+\.?)?|adj\.?|adv\.?|prep\.?|conj\.?|phrase|phr\.?)\)?\s*(.*)",
            line, re.IGNORECASE,
        )
        if pos_match and not current["part_of_speech"]:
            current["part_of_speech"] = pos_match.group(1).strip()
            rest = pos_match.group(2).strip()
            if rest and re.search(r"[가-힣]", rest) and not current["meaning"]:
                current["meaning"] = rest
            continue

        # Korean → meaning
        if re.search(r"[가-힣]", line):
            if not current["meaning"]:
                current["meaning"] = line
            elif len(current["meaning"]) < 40:
                current["meaning"] += ", " + line
            continue

        # Synonyms
        syn_match = re.match(r"^(?:=|syn[.:]\s*|synonym[s]?[.:]\s*)(.+)", line, re.IGNORECASE)
        if syn_match:
            current["synonyms"] = syn_match.group(1).strip()
            continue

        if "," in line and re.match(r"^[A-Za-z]", line) and len(line) < 80:
            parts = [p.strip() for p in line.split(",")]
            if all(re.match(r"^[A-Za-z\s]+$", p) for p in parts if p):
                if not current["synonyms"]:
                    current["synonyms"] = line
                else:
                    current["synonyms"] += ", " + line
                continue

        # Short English = synonyms
        if re.match(r"^[A-Za-z]", line) and len(line) < 40:
            if not current["synonyms"]:
                current["synonyms"] = line

    if current and current.get("word"):
        words.append(current)

    for w in words:
        w["word"] = re.sub(r"\s+", " ", w["word"]).strip()
        w["meaning"] = re.sub(r"\s+", " ", w["meaning"]).strip()
        w["synonyms"] = re.sub(r"\s+", " ", w["synonyms"]).strip().strip(", ")
        w["example_sentence"] = re.sub(r"\s+", " ", w.get("example_sentence", "")).strip()

    return _quality_filter(words)


def _quality_filter(words: list[dict]) -> list[dict]:
    """Filter garbage OCR and clean fields."""
    result = []
    for w in words:
        if not w.get("word"):
            continue

        word = re.sub(r"^\d{1,3}\s*[.):\s]*", "", w["word"]).strip()
        # Remove embedded POS
        pos_m = re.search(r"\s*\(([^)]+)\)\s*$", word)
        if pos_m:
            pt = pos_m.group(1)
            if re.match(r"^(n|v|adj|adv|prep|conj|phrase|phr)", pt, re.IGNORECASE):
                if not w["part_of_speech"]:
                    w["part_of_speech"] = pt
                word = word[:pos_m.start()].strip()
        w["word"] = re.sub(r"\s+", " ", word).strip()
        w["meaning"] = re.sub(r"\s+", " ", w.get("meaning", "")).strip()
        w["synonyms"] = re.sub(r"\s+", " ", w.get("synonyms", "")).strip().strip(", ")
        w["example_sentence"] = re.sub(r"\s+", " ", w.get("example_sentence", "")).strip()

        if re.search(r"(TOEFL|vocabulary|page)", w["word"], re.IGNORECASE):
            continue
        eng_chars = len(re.findall(r"[A-Za-z]", w["word"]))
        if eng_chars < 2:
            continue
        if eng_chars < len(w["word"]) * 0.4:
            continue
        if w.get("meaning") and not re.search(r"[가-힣]{2,}", w["meaning"]):
            w["meaning"] = ""
        result.append(w)
    return result


def _safe_remove(path):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass
