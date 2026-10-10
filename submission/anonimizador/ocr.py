"""Local OCR with Tesseract: words, their boxes and lines.

Images never leave the computer: only the text read here goes to the model.
Each word keeps its pixel box, so a masked word can be painted over exactly
where it is in the image.

Tesseract is found through TESSERACT_CMD, the PATH or the default Windows
folder; its language data through TESSDATA_PREFIX or %LOCALAPPDATA%/tessdata
(used when Program Files cannot be written to).
"""

import os
import shutil
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps
from scipy import ndimage

LANG = "por"
# Small photos are read better when enlarged; boxes are scaled back.
MIN_WIDTH = 1600
WINDOWS_CMD = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")


@dataclass(frozen=True)
class Box:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def height(self) -> int:
        return self.bottom - self.top

    def union(self, other: "Box") -> "Box":
        return Box(min(self.left, other.left), min(self.top, other.top),
                   max(self.right, other.right),
                   max(self.bottom, other.bottom))

    def padded(self, size: tuple[int, int]) -> "Box":
        """Grow the box so accents and descenders are covered too."""
        pad = max(2, round(self.height * 0.2))
        width, height = size
        return Box(max(0, self.left - pad), max(0, self.top - pad),
                   min(width, self.right + pad),
                   min(height, self.bottom + pad))


@dataclass(frozen=True)
class OcrWord:
    text: str
    box: Box
    confidence: float


def _pytesseract():
    import pytesseract

    cmd = os.environ.get("TESSERACT_CMD") or shutil.which("tesseract")
    if not cmd and WINDOWS_CMD.exists():
        cmd = str(WINDOWS_CMD)
    if cmd:
        pytesseract.pytesseract.tesseract_cmd = cmd
    if "TESSDATA_PREFIX" not in os.environ:
        local = Path(os.environ.get("LOCALAPPDATA", "")) / "tessdata"
        if (local / f"{LANG}.traineddata").exists():
            os.environ["TESSDATA_PREFIX"] = str(local)
    return pytesseract


def available() -> bool:
    """True when Tesseract and the Portuguese data can be used."""
    try:
        return LANG in _pytesseract().get_languages(config="")
    except Exception:
        return False


def prepare(image: Image.Image) -> Image.Image:
    """Apply the EXIF rotation and return plain RGB pixels.

    Without the rotation, the boxes would not match the photo as seen.
    """
    return ImageOps.exif_transpose(image).convert("RGB")


# Ink darker than this, after evening the light, counts as text.
INK = 110


def even_light(image: Image.Image) -> Image.Image:
    """Grey image with the lighting evened out.

    Photos are brighter on one side; a single threshold then loses the
    darker part of the page. Dividing by a blurred copy (the background
    light) gives the same contrast everywhere.
    """
    gray = image.convert("L")
    small = gray.resize((max(1, gray.width // 8), max(1, gray.height // 8)))
    background = small.filter(ImageFilter.GaussianBlur(25)).resize(
        gray.size, Image.BILINEAR)
    ratio = (np.asarray(gray, float)
             / np.maximum(np.asarray(background, float), 1) * 230)
    flat = Image.fromarray(np.clip(ratio, 0, 255).astype("uint8"))
    return ImageOps.autocontrast(flat, cutoff=1)


def unread_lines(image: Image.Image, lines: list[list["OcrWord"]]) -> int:
    """Count text lines on the image that OCR did not read.

    Ink outside every word box is merged along the line; a blob with the
    height and length of a line of text means text that was never read,
    so it was never checked by the model either.
    """
    heights = [word.box.height for line in lines for word in line]
    height = float(np.median(heights)) if heights else 20.0
    ink = np.asarray(even_light(image)) < INK
    covered = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(covered)
    for line in lines:
        for word in line:
            box = word.box.padded(image.size)
            draw.rectangle([box.left, box.top, box.right, box.bottom],
                           fill=255)
    left = ink & (np.asarray(covered) == 0)
    left = ndimage.binary_dilation(
        left, structure=np.ones((1, max(3, int(height * 0.8)))))
    labels, _ = ndimage.label(left)
    count = 0
    for rows, cols in ndimage.find_objects(labels):
        tall = rows.stop - rows.start
        wide = cols.stop - cols.start
        if 0.5 * height <= tall <= 3 * height and wide >= 3 * height:
            count += 1
    return count


def read_image(image: Image.Image) -> list[list[OcrWord]]:
    """Return the words of an RGB image grouped in lines, in reading order.

    ``image`` must already be prepared (see ``prepare``).
    """
    pytesseract = _pytesseract()
    scale = max(1, -(-MIN_WIDTH // image.width))
    source = even_light(image)
    if scale > 1:
        source = source.resize((image.width * scale, image.height * scale),
                               Image.LANCZOS)
    data = pytesseract.image_to_data(
        source, lang=LANG, config="--psm 3",
        output_type=pytesseract.Output.DICT,
    )
    lines: dict[tuple, list[OcrWord]] = {}
    for i, text in enumerate(data["text"]):
        text = (text or "").strip()
        if not text or float(data["conf"][i]) < 0:
            continue
        box = Box(
            data["left"][i] // scale, data["top"][i] // scale,
            -(-(data["left"][i] + data["width"][i]) // scale),
            -(-(data["top"][i] + data["height"][i]) // scale),
        )
        key = (data["page_num"][i], data["block_num"][i],
               data["par_num"][i], data["line_num"][i])
        # A word never holds whitespace, so line.split() stays in step.
        for part in text.split():
            lines.setdefault(key, []).append(
                OcrWord(part, box, float(data["conf"][i])))
    return list(lines.values())


def line_texts(lines: list[list[OcrWord]]) -> list[str]:
    return [" ".join(word.text for word in line) for line in lines]
