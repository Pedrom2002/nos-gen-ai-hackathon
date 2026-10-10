"""Remove from a PDF what the text pipeline cannot see.

Handwritten or scanned signatures, stamps and photos are images, and
digital signatures are form fields, so ``get_text()`` never returns them
and the model never masks them. They are removed in every profile: a
profile that keeps the signer's name already says who signed, and the
signature itself would only help someone forge it. The document metadata
(author, title, ...) is cleared as well, since it often holds names.

Images are deleted from the file, not covered with a box, so they cannot
be extracted afterwards. The text is left untouched.
"""

import sys
from dataclasses import dataclass
from pathlib import Path

import pymupdf

_BLACK = (0, 0, 0)


@dataclass
class SanitizeReport:
    images: int
    signature_fields: int


def _remove_signature_fields(page) -> int:
    removed = 0
    sig = [pymupdf.PDF_WIDGET_TYPE_SIGNATURE]
    while (widget := next(page.widgets(types=sig), None)) is not None:
        page.delete_widget(widget)
        removed += 1
    return removed


def _remove_images(page) -> int:
    removed = 0
    for xref, *_ in page.get_images(full=True):
        for rect in page.get_image_rects(xref):
            page.add_redact_annot(rect, fill=_BLACK)
            removed += 1
    if removed:
        page.apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_REMOVE,
            graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
            text=pymupdf.PDF_REDACT_TEXT_NONE,
        )
    return removed


def sanitize_pdf(src: str | Path, dst: str | Path) -> SanitizeReport:
    """Write a copy of ``src`` without images, signature fields or metadata."""
    report = SanitizeReport(images=0, signature_fields=0)
    with pymupdf.open(src) as doc:
        for page in doc:
            report.signature_fields += _remove_signature_fields(page)
            report.images += _remove_images(page)
        doc.set_metadata({})
        doc.del_xml_metadata()
        # garbage=4 drops the image streams that are no longer used.
        doc.save(dst, garbage=4, deflate=True)
    return report


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python -m anonimizador.sanitize <in.pdf> <out.pdf>")
    result = sanitize_pdf(sys.argv[1], sys.argv[2])
    print(f"{result.images} imagens e {result.signature_fields} campos de "
          f"assinatura removidos; metadados limpos.")
