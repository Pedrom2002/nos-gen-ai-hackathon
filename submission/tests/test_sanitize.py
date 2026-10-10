from pathlib import Path

import pymupdf
import pytest

from anonimizador.extract import extract_lines
from anonimizador.sanitize import sanitize_pdf

OFFICIAL_PDF = (
    Path(__file__).resolve().parents[2]
    / "raw_data"
    / "document_to_anonymize.pdf"
)
SIGNATURE_AREA = pymupdf.Rect(72, 100, 172, 150)


@pytest.fixture
def signed_pdf(tmp_path):
    """A one-page PDF with a signature image, a signature field and an
    author in the metadata."""
    path = tmp_path / "signed.pdf"
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Assinatura Digital:")
    pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 20, 10), 0)
    pix.clear_with(0)
    page.insert_image(SIGNATURE_AREA, pixmap=pix)
    # Text printed over the signature must survive.
    page.insert_text((80, 130), "Dr. Carlos Mendes")
    widget = pymupdf.Widget()
    widget.field_type = pymupdf.PDF_WIDGET_TYPE_SIGNATURE
    widget.field_name = "assinatura"
    widget.rect = pymupdf.Rect(72, 200, 200, 240)
    page.add_widget(widget)
    doc.set_metadata({"author": "Carlos Mendes"})
    doc.save(path)
    doc.close()
    return path


def _image_xrefs(doc):
    return [
        xref for xref in range(1, doc.xref_length())
        if doc.xref_get_key(xref, "Subtype") == ("name", "/Image")
    ]


def test_signature_image_and_field_are_removed(signed_pdf, tmp_path):
    out = tmp_path / "clean.pdf"
    report = sanitize_pdf(signed_pdf, out)
    assert report.images == 1
    assert report.signature_fields == 1
    with pymupdf.open(out) as doc:
        assert doc[0].get_images() == []
        assert list(doc[0].widgets()) == []
        # Deleted from the file, not only hidden behind a box.
        assert _image_xrefs(doc) == []


def test_metadata_is_cleared(signed_pdf, tmp_path):
    out = tmp_path / "clean.pdf"
    sanitize_pdf(signed_pdf, out)
    with pymupdf.open(out) as doc:
        assert not doc.metadata["author"]


def test_text_is_kept_even_over_the_signature(signed_pdf, tmp_path):
    out = tmp_path / "clean.pdf"
    sanitize_pdf(signed_pdf, out)
    # The signature field's own label ("SIGN") goes away with the field.
    assert extract_lines(out) == ["Assinatura Digital:", "Dr. Carlos Mendes"]


@pytest.mark.skipif(not OFFICIAL_PDF.exists(), reason="official PDF missing")
def test_official_pdf_text_is_unchanged(tmp_path):
    out = tmp_path / "clean.pdf"
    report = sanitize_pdf(OFFICIAL_PDF, out)
    assert report.signature_fields == 0
    assert extract_lines(out) == extract_lines(OFFICIAL_PDF)
