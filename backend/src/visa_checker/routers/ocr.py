from fastapi import APIRouter, UploadFile, File, HTTPException

from visa_checker.models import OCRResult
from visa_checker.services.mrz_service import extract_from_image

router = APIRouter(tags=["OCR"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/tiff",
    "image/bmp", "application/pdf",
}


def _pdf_to_images(pdf_bytes: bytes) -> list[bytes]:
    """Convert each page of a PDF to a JPEG image."""
    import fitz  # pymupdf

    images: list[bytes] = []
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    for page in doc:
        # Render at 2x resolution for better OCR
        pix = page.get_pixmap(dpi=300)
        images.append(pix.tobytes("jpeg"))
    doc.close()
    return images


@router.post("/ocr/extract", response_model=OCRResult)
async def extract_mrz(file: UploadFile = File(...)):
    """Upload a passport/ID image or PDF and extract MRZ data."""
    content_type = file.content_type or ""
    filename = (file.filename or "").lower()

    # Validate content type (allow unknown for files detected by extension)
    if content_type and content_type not in ALLOWED_CONTENT_TYPES:
        if not (filename.endswith((".jpg", ".jpeg", ".png", ".webp", ".tiff", ".bmp", ".pdf"))):
            raise HTTPException(status_code=400, detail="Unsupported file type")

    # Read with size limit
    file_bytes = await file.read(MAX_FILE_SIZE + 1)
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")

    # Detect PDF by content type or filename
    if content_type == "application/pdf" or filename.endswith(".pdf"):
        page_images = _pdf_to_images(file_bytes)
        # Try each page until MRZ is found
        for img_bytes in page_images:
            result = extract_from_image(img_bytes)
            if result.mrz.success:
                return result
        # No page had a valid MRZ — return last result or a generic error
        if page_images:
            return extract_from_image(page_images[0])
        return OCRResult(
            mrz={"success": False, "error": "PDF has no pages"},
            image_hash="",
        )

    return extract_from_image(file_bytes)
