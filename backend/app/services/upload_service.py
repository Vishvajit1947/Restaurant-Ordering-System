import io
import uuid
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.core.exceptions import Unprocessable

ALLOWED = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


async def save_image(file: UploadFile, subdir: str = "menu") -> str:
    data = await file.read(settings.MAX_UPLOAD_BYTES + 1)
    if len(data) > settings.MAX_UPLOAD_BYTES:
        raise Unprocessable("Images must be 2 MB or smaller.", code="FILE_TOO_LARGE")
    if not data:
        raise Unprocessable("The uploaded file is empty.", code="INVALID_IMAGE")
    try:
        with Image.open(io.BytesIO(data)) as img:
            fmt = img.format
            img.verify()
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise Unprocessable("The file is not a valid image.", code="INVALID_IMAGE") from None
    if fmt not in ALLOWED:
        raise Unprocessable("Only JPEG, PNG and WebP images are allowed.", code="INVALID_IMAGE")

    target_dir = Path(settings.MEDIA_DIR) / subdir
    target_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ALLOWED[fmt]}"
    (target_dir / name).write_bytes(data)
    return f"/media/{subdir}/{name}"
