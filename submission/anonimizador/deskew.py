"""Straighten a photographed page before OCR.

A phone photo shows the page in perspective, with background around it.
The page is found as the largest bright region, its four corners give a
perspective transform, and OCR reads the flattened page, where lines are
straight. Boxes found there are mapped back to the original photo, so the
redacted image is still the photo the person sent.
"""

from dataclasses import dataclass

import numpy as np
from PIL import Image
from scipy import ndimage

WORK_SIZE = 1000          # longest side used to find the page
MIN_PAGE_SHARE = 0.2      # the page must cover at least this share
FLAT_TOLERANCE = 0.03     # corners this close to the image corners: flat


@dataclass(frozen=True)
class Warp:
    """Perspective from the flattened page back to the original photo."""
    size: tuple[int, int]     # flattened page size
    coeffs: tuple             # PIL PERSPECTIVE: flat point -> photo point

    def flatten(self, image: Image.Image) -> Image.Image:
        return image.transform(self.size, Image.PERSPECTIVE, self.coeffs,
                               Image.BICUBIC, fillcolor=(255, 255, 255))

    def to_original(self, points):
        a, b, c, d, e, f, g, h = self.coeffs
        mapped = []
        for x, y in points:
            w = g * x + h * y + 1
            mapped.append(((a * x + b * y + c) / w, (d * x + e * y + f) / w))
        return mapped


def _otsu(gray: np.ndarray) -> float:
    hist = np.bincount(gray.ravel(), minlength=256).astype(float)
    total = hist.sum()
    weights = np.cumsum(hist)
    means = np.cumsum(hist * np.arange(256))
    between = (means[-1] * weights - means * total) ** 2 / np.maximum(
        weights * (total - weights), 1)
    return float(np.argmax(between))


def find_page(image: Image.Image):
    """Return the page corners (tl, tr, br, bl) in photo pixels, or None
    when no page stands out or the photo is already flat."""
    scale = WORK_SIZE / max(image.size)
    small = image.convert("L").resize(
        (max(1, round(image.width * scale)),
         max(1, round(image.height * scale))))
    gray = np.asarray(small)
    mask = ndimage.binary_opening(gray > _otsu(gray), iterations=3)
    labels, count = ndimage.label(mask)
    if not count:
        return None
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    largest = int(np.argmax(sizes)) + 1
    if sizes[largest - 1] < MIN_PAGE_SHARE * mask.size:
        return None
    ys, xs = np.nonzero(ndimage.binary_fill_holes(labels == largest))
    corners = [(xs[np.argmin(xs + ys)], ys[np.argmin(xs + ys)]),
               (xs[np.argmax(xs - ys)], ys[np.argmax(xs - ys)]),
               (xs[np.argmax(xs + ys)], ys[np.argmax(xs + ys)]),
               (xs[np.argmin(xs - ys)], ys[np.argmin(xs - ys)])]
    height, width = gray.shape
    frame = [(0, 0), (width - 1, 0), (width - 1, height - 1),
             (0, height - 1)]
    if all(abs(x - fx) <= FLAT_TOLERANCE * width
           and abs(y - fy) <= FLAT_TOLERANCE * height
           for (x, y), (fx, fy) in zip(corners, frame)):
        return None
    return [(float(x) / scale, float(y) / scale) for x, y in corners]


def _coeffs(flat, photo) -> tuple:
    """Solve the 8 PIL perspective coefficients mapping flat -> photo."""
    rows, rhs = [], []
    for (x, y), (u, v) in zip(flat, photo):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        rhs += [u, v]
    return tuple(np.linalg.solve(np.array(rows, float), np.array(rhs)))


def _distance(p, q) -> float:
    return float(np.hypot(p[0] - q[0], p[1] - q[1]))


SKEW_WORK = 900           # longest side used to measure the tilt of the text
MAX_SKEW = 10.0           # degrees tried on each side
MIN_SKEW = 0.5            # a smaller tilt is left alone
SKEW_GAIN = 1.1           # lines must get this much sharper to be believed


def _sharpness(ink: Image.Image, angle: float) -> float:
    """How sharply the rows of ink stand apart once turned by ``angle``:
    straight lines of text give a profile that jumps between rows."""
    rows = np.asarray(ink.rotate(angle, resample=Image.BILINEAR),
                      dtype=float).sum(axis=1)
    return float(np.sum(np.diff(rows) ** 2))


def estimate_skew(image: Image.Image) -> float:
    """The turn, in degrees (PIL ``rotate``: counter-clockwise), that levels
    the lines of text, or 0.0 when the text is level or there is none."""
    scale = SKEW_WORK / max(image.size)
    small = image.convert("L").resize(
        (max(1, round(image.width * scale)),
         max(1, round(image.height * scale))))
    gray = np.asarray(small, dtype=float)
    # Text is much darker than the paper, which is most of a page.
    ink = Image.fromarray(
        ((gray < 0.6 * np.median(gray)) * 255).astype(np.uint8))
    if not np.asarray(ink).any():
        return 0.0
    coarse = np.arange(-MAX_SKEW, MAX_SKEW + 0.01, 0.5)
    best = max(coarse, key=lambda a: _sharpness(ink, a))
    fine = np.arange(best - 0.5, best + 0.51, 0.1)
    best = max(fine, key=lambda a: _sharpness(ink, a))
    if abs(best) < MIN_SKEW:
        return 0.0
    if _sharpness(ink, best) < SKEW_GAIN * _sharpness(ink, 0.0):
        return 0.0
    return round(float(best), 1)


def _rotation_warp(size: tuple[int, int], angle: float) -> Warp:
    """The Warp that turns an image by ``angle`` degrees (as PIL ``rotate``
    with ``expand``), so boxes read on the turned page map back."""
    width, height = size
    c, s = np.cos(np.radians(angle)), np.sin(np.radians(angle))
    out_w = int(np.ceil(abs(width * c) + abs(height * s)))
    out_h = int(np.ceil(abs(width * s) + abs(height * c)))

    def to_photo(x, y):
        dx, dy = x - out_w / 2, y - out_h / 2
        return (width / 2 + c * dx - s * dy, height / 2 + s * dx + c * dy)

    flat = [(0, 0), (out_w, 0), (out_w, out_h), (0, out_h)]
    return Warp((out_w, out_h),
                _coeffs(flat, [to_photo(x, y) for x, y in flat]))


def skew_warp(image: Image.Image):
    """The Warp that levels crooked lines of text, or None if level."""
    angle = estimate_skew(image)
    return _rotation_warp(image.size, angle) if angle else None


def page_warp(image: Image.Image):
    """The Warp that flattens the photographed page, or None.

    A page with a visible border is flattened by its corners. Without one
    (a cropped or light-on-light photo) only the tilt of the text is fixed.
    """
    corners = find_page(image)
    if corners is None:
        return skew_warp(image)
    tl, tr, br, bl = corners
    width = round(max(_distance(tl, tr), _distance(bl, br)))
    height = round(max(_distance(tl, bl), _distance(tr, br)))
    flat = [(0, 0), (width, 0), (width, height), (0, height)]
    return Warp((width, height), _coeffs(flat, corners))
