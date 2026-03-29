"""
Parse vocabulary images (like TOEFL vocab book pages) using OCR.
Uses EasyOCR (deep learning) for best Korean+English recognition.
Falls back to tesseract or OCR.space if unavailable.
"""
import re
import os


# Lazy-loaded EasyOCR reader (heavy model, load once)
_easyocr_reader = None


def _get_easyocr_reader():
    global _easyocr_reader
    if _easyocr_reader is None:
        import easyocr
        _easyocr_reader = easyocr.Reader(["ko", "en"], gpu=False)
    return _easyocr_reader


def parse_vocab_image(image_path: str) -> list[dict]:
    """Main entry: try EasyOCR first, then tesseract, then OCR.space."""
    from PIL import Image, ImageOps

    # Fix EXIF orientation
    img = Image.open(image_path)
    try:
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Save orientation-fixed image for OCR
    fixed_path = image_path + ".fixed.jpg"
    img.save(fixed_path, "JPEG", quality=95)

    try:
        # Try EasyOCR (best quality)
        words = _try_easyocr(fixed_path, img)
        if len(words) >= 2:
            return words

        # Fallback: tesseract
        words = _try_tesseract(fixed_path)
        if len(words) >= 2:
            return words

        # Fallback: OCR.space
        words = _try_ocr_space(fixed_path)
        if words:
            return words

        return words
    finally:
        _safe_remove(fixed_path)


def _try_easyocr(image_path: str, img) -> list[dict]:
    """OCR with EasyOCR + spatial analysis for table layout."""
    try:
        reader = _get_easyocr_reader()
    except (ImportError, Exception) as e:
        print(f"[OCR] EasyOCR unavailable: {e}")
        return []

    import numpy as np
    img_array = np.array(img)
    img_h, img_w = img_array.shape[:2]

    best_words = []

    # Try original and 90° rotation (for landscape photos)
    for rotation in [0, 90]:
        if rotation:
            rot_img = img.rotate(rotation, expand=True)
            arr = np.array(rot_img)
        else:
            arr = img_array

        try:
            results = reader.readtext(arr, paragraph=False)
        except Exception as e:
            print(f"[OCR] EasyOCR error: {e}")
            continue

        if not results:
            continue

        words = _parse_easyocr_spatial(results)
        if len(words) > len(best_words):
            best_words = words
            if len(words) >= 5:
                return words

    return best_words


def _parse_easyocr_spatial(results: list) -> list[dict]:
    """
    Parse EasyOCR results using spatial position to reconstruct table rows.
    Each result: (bbox, text, confidence)
    bbox: [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
    """
    if not results:
        return []

    # Extract items with position
    items = []
    for bbox, text, conf in results:
        text = text.strip()
        if not text or len(text) < 1:
            continue
        # Get center Y and left X
        ys = [p[1] for p in bbox]
        xs = [p[0] for p in bbox]
        cy = sum(ys) / len(ys)
        lx = min(xs)
        h = max(ys) - min(ys)
        items.append({
            "text": text,
            "cy": cy,
            "lx": lx,
            "height": h,
            "conf": conf,
        })

    if not items:
        return []

    # Sort by vertical position
    items.sort(key=lambda x: x["cy"])

    # Group into rows (items with similar Y position)
    rows = []
    median_h = sorted([it["height"] for it in items if it["height"] > 0])[len(items) // 2] if items else 20
    threshold = max(median_h * 0.6, 10)

    current_row = [items[0]]
    for it in items[1:]:
        if abs(it["cy"] - current_row[-1]["cy"]) < threshold:
            current_row.append(it)
        else:
            rows.append(current_row)
            current_row = [it]
    rows.append(current_row)

    # Sort each row by X position (left to right)
    for row in rows:
        row.sort(key=lambda x: x["lx"])

    # Now parse rows into vocabulary entries
    # Vocab book format: number | English word | (POS) | Korean meaning | synonyms
    entries = []
    current = None

    for row in rows:
        row_text = " ".join(it["text"] for it in row)

        # Skip noise lines
        if len(row_text.strip()) < 2:
            continue
        if re.match(r"^[-~—=_*#|]+$", row_text.strip()):
            continue
        # Skip title/header lines
        if re.search(r"(TOEFL|voca|BOB|TOEEL|page\s*\d+|vocabulary)", row_text, re.IGNORECASE):
            continue
        if re.match(r"^(\d+[-—]\d*[-—]?|[oO0°©®]+)\s*$", row_text):
            continue

        # Check if row starts with a number (new entry)
        num_match = re.match(r"^(\d{1,3})\s*[.):\s]*(.+)", row_text)
        if num_match:
            rest = num_match.group(2).strip()
            # Split rest into English and Korean parts
            eng_parts, kor_parts, pos, syn_parts = _split_mixed_text(rest, row)

            if eng_parts:
                if current and current.get("word"):
                    entries.append(current)
                current = {
                    "word": eng_parts,
                    "meaning": kor_parts,
                    "part_of_speech": pos,
                    "synonyms": syn_parts,
                    "example_sentence": "",
                }
                continue

        if not current:
            # Maybe a standalone English word line
            if re.match(r"^[A-Za-z]", row_text) and len(row_text) < 40:
                current = {
                    "word": row_text.strip(),
                    "meaning": "",
                    "part_of_speech": "",
                    "synonyms": "",
                    "example_sentence": "",
                }
            continue

        # Check what this row contains
        has_korean = bool(re.search(r"[가-힣]", row_text))
        has_english = bool(re.search(r"[A-Za-z]{2,}", row_text))

        # Part of speech line
        pos_match = re.match(
            r"^\(?(n\.?(?:/[a-z]+\.?)?|v\.?(?:/[a-z]+\.?)?|adj\.?|adv\.?|prep\.?|conj\.?|phrase|phr\.?)\)?\s*(.*)",
            row_text, re.IGNORECASE,
        )
        if pos_match and not current["part_of_speech"]:
            current["part_of_speech"] = pos_match.group(1).strip()
            rest = pos_match.group(2).strip()
            if rest and re.search(r"[가-힣]", rest) and not current["meaning"]:
                current["meaning"] = rest
            continue

        # Korean meaning
        if has_korean and not current["meaning"]:
            current["meaning"] = row_text.strip()
            continue
        elif has_korean and current["meaning"] and len(current["meaning"]) < 30:
            current["meaning"] += ", " + row_text.strip()
            continue

        # Synonyms (comma-separated English words or = prefix)
        syn_match = re.match(r"^(?:=|syn[.:]\s*|synonym[s]?[.:]\s*)(.+)", row_text, re.IGNORECASE)
        if syn_match:
            current["synonyms"] = syn_match.group(1).strip()
            continue

        if has_english and not has_korean and "," in row_text and len(row_text) < 80:
            parts = [p.strip() for p in row_text.split(",")]
            if all(re.match(r"^[A-Za-z\s]+$", p) for p in parts if p):
                if not current["synonyms"]:
                    current["synonyms"] = row_text.strip()
                else:
                    current["synonyms"] += ", " + row_text.strip()
                continue

        # English synonyms (short, no comma)
        if has_english and not has_korean and len(row_text) < 40:
            if not current["synonyms"]:
                current["synonyms"] = row_text.strip()
            continue

        # Example sentence
        if re.match(r"^[A-Z].*[.?!]$", row_text) and len(row_text) > 20:
            if not current["example_sentence"]:
                current["example_sentence"] = row_text
            continue

    if current and current.get("word"):
        entries.append(current)

    # Quality filter
    return _quality_filter(entries)


def _split_mixed_text(text: str, row_items: list) -> tuple:
    """Split a mixed Korean+English text into word, meaning, POS, synonyms."""
    eng_parts = []
    kor_parts = []
    pos = ""
    syn_parts = []

    # Check for POS in parentheses
    pos_match = re.search(r"\((\w+\.?(?:/\w+\.?)?)\)", text)
    if pos_match:
        pos_text = pos_match.group(1)
        if re.match(r"^(n|v|adj|adv|prep|conj|phrase|phr)\.?", pos_text, re.IGNORECASE):
            pos = pos_text
            text = text[:pos_match.start()] + text[pos_match.end():]

    # Split by Korean/English boundaries using individual items
    for it in row_items:
        t = it["text"].strip()
        if not t:
            continue
        # Skip if it's a number at the start
        if re.match(r"^\d{1,3}[.)\s]*$", t):
            continue
        # Skip POS we already extracted
        if pos and t.strip("()") == pos:
            continue

        has_kor = bool(re.search(r"[가-힣]", t))
        has_eng = bool(re.search(r"[A-Za-z]", t))

        if has_kor and not has_eng:
            kor_parts.append(t)
        elif has_eng and not has_kor:
            # If we already have Korean parts, this might be synonyms
            if kor_parts:
                syn_parts.append(t)
            else:
                eng_parts.append(t)
        elif has_kor and has_eng:
            # Mixed - try to split
            mixed = re.split(r"(?<=[가-힣])\s+(?=[A-Za-z])|(?<=[A-Za-z])\s+(?=[가-힣])", t)
            for part in mixed:
                if re.search(r"[가-힣]", part):
                    kor_parts.append(part.strip())
                elif re.search(r"[A-Za-z]", part):
                    if kor_parts:
                        syn_parts.append(part.strip())
                    else:
                        eng_parts.append(part.strip())

    word = " ".join(eng_parts).strip()
    meaning = " ".join(kor_parts).strip()
    synonyms = ", ".join(syn_parts).strip()

    # If no separate parts found, try splitting the original text
    if not word:
        # Fallback: take everything before first Korean char
        m = re.match(r"^([A-Za-z\s]+)", text.strip())
        if m:
            word = m.group(1).strip()
            rest = text[m.end():].strip()
            if re.search(r"[가-힣]", rest):
                meaning = rest

    return word, meaning, pos, synonyms


def _try_tesseract(image_path: str) -> list[dict]:
    """Fallback OCR with local tesseract."""
    try:
        from PIL import Image
        import pytesseract
    except ImportError:
        return []

    img = Image.open(image_path)
    if img.mode != "RGB":
        img = img.convert("RGB")

    best_words = []

    for rotation in [0, 90]:
        rotated = img.rotate(rotation, expand=True) if rotation else img
        for psm in [6, 3, 4]:
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


def _try_ocr_space(image_path: str) -> list[dict]:
    """Fallback OCR using OCR.space free API with overlay data."""
    try:
        import httpx
    except ImportError:
        return []

    try:
        with open(image_path, "rb") as f:
            file_data = f.read()
    except Exception:
        return []

    best_words = []
    fname = os.path.basename(image_path)

    for engine, lang in [("2", "kor"), ("1", "kor")]:
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    "https://api.ocr.space/parse/image",
                    files={"file": (fname, file_data, "image/jpeg")},
                    data={
                        "apikey": "helloworld",
                        "language": lang,
                        "isOverlayRequired": "true",
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
                        # Try spatial parsing from overlay
                        overlay = results[0].get("TextOverlay", {})
                        if overlay and overlay.get("Lines"):
                            words = _parse_ocr_space_overlay(overlay)
                            if len(words) > len(best_words):
                                best_words = words
                                if len(words) >= 5:
                                    return words

                        # Fallback to plain text parsing
                        text = results[0].get("ParsedText", "")
                        if text.strip():
                            words = _parse_plain_text(text)
                            if len(words) > len(best_words):
                                best_words = words
                                if len(words) >= 5:
                                    return words
        except Exception:
            continue

    return best_words


def _parse_ocr_space_overlay(overlay: dict) -> list[dict]:
    """Parse OCR.space overlay data using spatial positions."""
    lines_data = overlay.get("Lines", [])
    if not lines_data:
        return []

    # Build rows from overlay lines
    rows = []
    for line in lines_data:
        words = line.get("Words", [])
        if not words:
            continue
        text = " ".join(w.get("WordText", "") for w in words)
        top = line.get("MinTop", words[0].get("Top", 0))
        rows.append({"text": text.strip(), "top": top})

    # Sort by vertical position
    rows.sort(key=lambda r: r["top"])

    # Join all text and parse
    full_text = "\n".join(r["text"] for r in rows)
    return _parse_plain_text(full_text)


def _parse_plain_text(text: str) -> list[dict]:
    """Parse plain OCR text into structured vocabulary entries."""
    words = []
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]

    current = None

    for line in lines:
        if len(line) < 2:
            continue
        if re.match(r"^[-~—=_*#|]+$", line):
            continue
        if re.match(r"^(voca|TOEFL|BOB|TOEEL|TOEEI|page|\d+[-—]\d*[-—]?|[oO0°©®]+)$", line, re.IGNORECASE):
            continue

        # Pattern: "27 Shed light on" or "27. Shed light on"
        num_match = re.match(r"^(\d{1,3})[.):\s]+(.+)", line)
        if num_match:
            word_text = num_match.group(2).strip()
            if len(word_text) >= 2 and re.search(r"[A-Za-z]", word_text):
                if current and current.get("word"):
                    words.append(current)

                # Split English and Korean parts
                eng, kor, pos = "", "", ""
                pos_match = re.search(r"\((\w+\.?(?:/\w+\.?)?)\)", word_text)
                if pos_match:
                    p = pos_match.group(1)
                    if re.match(r"^(n|v|adj|adv|prep|conj|phrase|phr)\.?", p, re.IGNORECASE):
                        pos = p
                        word_text = word_text[:pos_match.start()] + word_text[pos_match.end():]

                # Try to split by Korean/English boundary
                kor_match = re.search(r"[가-힣]", word_text)
                if kor_match:
                    eng = word_text[:kor_match.start()].strip()
                    kor = word_text[kor_match.start():].strip()
                else:
                    eng = word_text.strip()

                current = {
                    "word": eng,
                    "meaning": kor,
                    "part_of_speech": pos,
                    "synonyms": "",
                    "example_sentence": "",
                }
                continue

        if not current:
            if re.match(r"^[A-Z][a-zA-Z\s]{1,30}$", line):
                current = {"word": line.strip(), "meaning": "", "part_of_speech": "", "synonyms": "", "example_sentence": ""}
            continue

        # Part of speech
        pos_match = re.match(
            r"^\(?(n\.?(?:/[a-z]+\.?)?|v\.?(?:/[a-z]+\.?)?|adj\.?|adv\.?|prep\.?|conj\.?|phrase|phr\.?)\)?\s*(.*)",
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

        # Example sentence
        if re.match(r"^[A-Z].*[.?!]$", line) and len(line) > 20:
            if not current["example_sentence"]:
                current["example_sentence"] = line
            continue

        # Short English text = synonyms
        if re.match(r"^[A-Za-z]", line) and len(line) < 40:
            if not current["synonyms"]:
                current["synonyms"] = line

    if current and current.get("word"):
        words.append(current)

    # Clean up
    for w in words:
        w["word"] = re.sub(r"\s+", " ", w["word"]).strip()
        w["meaning"] = re.sub(r"\s+", " ", w["meaning"]).strip()
        w["synonyms"] = re.sub(r"\s+", " ", w["synonyms"]).strip().strip(", ")
        w["example_sentence"] = re.sub(r"\s+", " ", w.get("example_sentence", "")).strip()

    return _quality_filter(words)


def _quality_filter(words: list[dict]) -> list[dict]:
    """Filter out garbage OCR results and clean up fields."""
    result = []
    for w in words:
        if not w.get("word"):
            continue

        # Clean word: strip leading numbers like "28 Utilize" → "Utilize"
        word = re.sub(r"^\d{1,3}\s*[.):\s]*", "", w["word"]).strip()
        # Remove POS from word if embedded: "Utilize (V)" → "Utilize"
        pos_in_word = re.search(r"\s*\(([^)]+)\)\s*$", word)
        if pos_in_word:
            pos_text = pos_in_word.group(1)
            if re.match(r"^(n|v|adj|adv|prep|conj|phrase|phr)", pos_text, re.IGNORECASE):
                if not w["part_of_speech"]:
                    w["part_of_speech"] = pos_text
                word = word[:pos_in_word.start()].strip()
        w["word"] = re.sub(r"\s+", " ", word).strip()

        # Clean meaning
        w["meaning"] = re.sub(r"\s+", " ", w.get("meaning", "")).strip()
        w["synonyms"] = re.sub(r"\s+", " ", w.get("synonyms", "")).strip().strip(", ")
        w["example_sentence"] = re.sub(r"\s+", " ", w.get("example_sentence", "")).strip()

        # Skip title/noise
        if re.search(r"(TOEFL|vocabulary|page)", w["word"], re.IGNORECASE):
            continue

        # Word should have at least 2 English chars
        eng_chars = len(re.findall(r"[A-Za-z]", w["word"]))
        if eng_chars < 2:
            continue
        # Word should be mostly English (at least 40%)
        if eng_chars < len(w["word"]) * 0.4:
            continue
        # If we have meaning, it should have Korean
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
