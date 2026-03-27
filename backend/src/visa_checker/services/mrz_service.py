"""MRZ extraction service wrapping FastMRZ."""

import hashlib
import tempfile
from pathlib import Path

import cv2
import numpy as np
from fastmrz import FastMRZ
from visa_checker.models import MRZResult, MRZFields, OCRResult

_fast_mrz: FastMRZ | None = None


def _get_mrz() -> FastMRZ:
    global _fast_mrz
    if _fast_mrz is None:
        _fast_mrz = FastMRZ()
    return _fast_mrz


def _rotation_variants(image_bytes: bytes) -> list[bytes]:
    """Return original + 3 rotation variants (for scanned PDFs that may be sideways)."""
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return [image_bytes]

    variants: list[bytes] = [image_bytes]
    for angle in (cv2.ROTATE_90_CLOCKWISE, cv2.ROTATE_180, cv2.ROTATE_90_COUNTERCLOCKWISE):
        rotated = cv2.rotate(img, angle)
        _, buf = cv2.imencode(".jpg", rotated)
        variants.append(buf.tobytes())
    return variants


def _full_variants(image_bytes: bytes) -> list[bytes]:
    """Return original + rotations + enhancement variants for real-world photos."""
    variants = _rotation_variants(image_bytes)

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        return variants

    # CLAHE contrast enhancement + sharpen
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_ch = clahe.apply(l_ch)
    enhanced = cv2.merge([l_ch, a_ch, b_ch])
    enhanced = cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    enhanced = cv2.filter2D(enhanced, -1, kernel)
    _, buf = cv2.imencode(".jpg", enhanced)
    variants.append(buf.tobytes())

    # Grayscale adaptive threshold (handles uneven lighting)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    thresh = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
    )
    thresh_bgr = cv2.cvtColor(thresh, cv2.COLOR_GRAY2BGR)
    _, buf = cv2.imencode(".jpg", thresh_bgr)
    variants.append(buf.tobytes())

    # Upscale small images for better OCR
    h, w = img.shape[:2]
    if max(h, w) < 2000:
        scale = 2000 / max(h, w)
        resized = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
        _, buf = cv2.imencode(".jpg", resized)
        variants.append(buf.tobytes())

    return variants


def _try_extract(image_bytes: bytes, image_hash: str) -> OCRResult | None:
    """Try MRZ extraction on a single image variant. Returns None if no MRZ found."""
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(image_bytes)
        tmp_path = f.name

    try:
        mrz = _get_mrz()
        raw_mrz = mrz.get_details(tmp_path, ignore_parse=True)
        if not raw_mrz:
            return None

        parsed = mrz.get_details(tmp_path)

        if not parsed:
            return OCRResult(
                mrz=MRZResult(success=False, raw=str(raw_mrz), error="MRZ parsing failed"),
                image_hash=image_hash,
            )

        # Extract fields even if checksums failed — the data is usually
        # mostly correct from real-world photos with slight OCR errors.
        fields = MRZFields(
            surname=parsed.get("surname", "").strip() or None,
            given_names=parsed.get("given_name", "").strip() or None,
            passport_number=parsed.get("document_number", "").strip() or None,
            nationality=parsed.get("nationality_code", "").strip() or None,
            date_of_birth=parsed.get("birth_date") or None,
            gender=parsed.get("sex") or None,
            expiry_date=parsed.get("expiry_date") or None,
            issuing_country=parsed.get("issuer_code", "").strip() or None,
            document_type=parsed.get("document_code", "").strip() or None,
        )

        # Validate that we actually got meaningful data — fastmrz can
        # sometimes return "success" on garbage text containing '<' chars.
        # At minimum we need a surname or passport number.
        has_data = any([
            fields.surname, fields.given_names, fields.passport_number,
        ])
        if not has_data:
            return None  # Treat as no MRZ found, try next variant

        check_valid = parsed.get("status") != "FAILURE"

        return OCRResult(
            mrz=MRZResult(
                success=True,
                raw=str(raw_mrz),
                fields=fields,
                check_digits_valid=check_valid,
            ),
            image_hash=image_hash,
        )
    except Exception as e:
        return OCRResult(
            mrz=MRZResult(success=False, error=str(e)),
            image_hash=image_hash,
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def extract_from_image(image_bytes: bytes, pdf_mode: bool = False) -> OCRResult:
    """Extract MRZ data from a passport/ID image.

    Args:
        image_bytes: Raw image bytes (JPEG/PNG).
        pdf_mode: If True, only try rotations (skip heavy enhancements)
                  since scanned PDFs are already clean.
    """
    image_hash = hashlib.sha256(image_bytes).hexdigest()

    variants = _rotation_variants(image_bytes) if pdf_mode else _full_variants(image_bytes)

    for variant_bytes in variants:
        result = _try_extract(variant_bytes, image_hash)
        if result is not None:
            return result

    return OCRResult(
        mrz=MRZResult(
            success=False,
            error="No MRZ detected in image. Try a flatter, well-lit photo with the MRZ zone clearly visible.",
        ),
        image_hash=image_hash,
    )
