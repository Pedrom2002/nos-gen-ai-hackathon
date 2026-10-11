"""Make the photo test files F01-F06 from the official challenge PDF.

Usage (from the submission folder):
    python data/test_docs/make_photos.py [OUT_DIR]

Each page of the PDF is rendered, then degraded the way a phone photo is:
blur, uneven light, noise and JPEG compression. The result is invented
test data (the PDF is fictitious); nothing here is a real photograph.
"""

import io
import sys
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
PDF = ROOT / "raw_data" / "document_to_anonymize.pdf"
OUT = Path(__file__).resolve().parent
ZOOM = 1.6
JPEG_QUALITY = 62


def pages():
    with pymupdf.open(PDF) as doc:
        for page in doc:
            pix = page.get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM))
            yield Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def light_and_noise(image, rng, sigma):
    data = np.asarray(image).astype(np.float32)
    data = data * np.linspace(0.85, 1.05, data.shape[1])[None, :, None]
    data = data + rng.normal(0, sigma, data.shape)
    return Image.fromarray(np.clip(data, 0, 255).astype(np.uint8))


def on_a_table(page, seed):
    """The page on a dark table, seen at an angle (perspective)."""
    rng = np.random.default_rng(seed)
    w, h = page.size
    canvas = Image.new("RGB", (w + 500, h + 500), (96, 84, 72))
    canvas.paste(page, (250, 250))
    quad = (150, 190, 110, h + 330, w + 380, h + 300, w + 350, 150)
    photo = canvas.transform((1100, 1450), Image.QUAD, quad, Image.BICUBIC)
    return light_and_noise(photo.filter(ImageFilter.GaussianBlur(0.8)),
                           rng, 6)


def tilted(page, seed):
    """The page turned 1.6 degrees with no visible border to find."""
    rng = np.random.default_rng(seed)
    photo = page.rotate(1.6, expand=True, fillcolor=(235, 232, 226),
                        resample=Image.BICUBIC)
    return light_and_noise(photo.filter(ImageFilter.GaussianBlur(0.9)),
                           rng, 7)


def save(image, path):
    if path.suffix == ".png":
        image.save(path, format="PNG")
        return
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=JPEG_QUALITY)
    path.write_bytes(buffer.getvalue())


def main(out_dir: Path = OUT) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for n, page in enumerate(pages(), 1):
        first = 3 * (n - 1) + 1
        save(page, out_dir / f"F{first:02d}_pag{n}_scan.png")
        save(on_a_table(page, n),
             out_dir / f"F{first + 1:02d}_pag{n}_mesa.jpg")
        save(tilted(page, n),
             out_dir / f"F{first + 2:02d}_pag{n}_inclinada.jpg")


if __name__ == "__main__":
    main(Path(sys.argv[1]) if len(sys.argv) > 1 else OUT)
