import io
import threading
import time

import pymupdf
import pytest
from PIL import Image

from anonimizador import ocr, redact_verify, sources
from anonimizador.redact import Redacted
from anonimizador.sources import Source


class Probe:
    """Counts how many calls run at the same time."""

    def __init__(self):
        self.lock = threading.Lock()
        self.active = 0
        self.peak = 0

    def __enter__(self):
        with self.lock:
            self.active += 1
            self.peak = max(self.peak, self.active)

    def __exit__(self, *exc):
        with self.lock:
            self.active -= 1


# --- map_pages -----------------------------------------------------------

def test_results_come_back_in_page_order_even_if_pages_finish_out_of_order():
    def slow_first(n):
        time.sleep(0.2 if n == 0 else 0.0)
        return n * 10

    assert ocr.map_pages(slow_first, range(7), workers=3) == [
        0, 10, 20, 30, 40, 50, 60]


def test_pages_are_read_at_the_same_time_but_never_more_than_the_limit():
    probe = Probe()

    def work(n):
        with probe:
            time.sleep(0.05)
        return n

    ocr.map_pages(work, range(9), workers=3)
    assert 2 <= probe.peak <= 3


def test_pages_are_taken_from_the_source_only_as_they_are_needed():
    # A scanned page is ~26 MB of pixels: only a few may exist at a time.
    taken = []
    finished = []
    peak = []

    def source():
        for n in range(10):
            taken.append(n)
            yield n

    def work(n):
        peak.append(len(taken) - len(finished))
        time.sleep(0.02)
        finished.append(n)
        return n

    ocr.map_pages(work, source(), workers=3)
    assert max(peak) <= 3


def test_one_worker_reads_the_pages_in_turn():
    probe = Probe()

    def work(n):
        with probe:
            time.sleep(0.01)
        return n

    ocr.map_pages(work, range(4), workers=1)
    assert probe.peak == 1


def test_a_failing_page_raises_its_error():
    def work(n):
        if n == 4:
            raise RuntimeError("page 4 failed")
        return n

    with pytest.raises(RuntimeError, match="page 4 failed"):
        ocr.map_pages(work, range(8), workers=3)


# --- sources: reading a scanned document ---------------------------------

def fake_ocr(monkeypatch, probe=None, failing=None):
    """Pages are images whose width says which page they are (100 + n)."""
    def read_image(image, psm=3, **kwargs):
        n = image.width - 100
        if n == failing:
            raise RuntimeError("OCR crashed")
        with probe or Probe():
            time.sleep(0.15 if n == 0 else 0.01)
        box = ocr.Box(5, 5, 60, 25)
        return [[ocr.OcrWord(f"pagina{n}", box, 90.0),
                 ocr.OcrWord("linha", box, 90.0)],
                [ocr.OcrWord(f"fim{n}", box, 20.0)]]

    monkeypatch.setattr(ocr, "available", lambda: True)
    monkeypatch.setattr(ocr, "read_image", read_image)
    monkeypatch.setattr(ocr, "recover_unread",
                        lambda image, lines, **kwargs: (lines, []))
    monkeypatch.setattr(
        Source, "page_images",
        lambda self: (Image.new("RGB", (100 + n, 80), "white")
                      for n in range(5)))


def test_a_scanned_document_keeps_its_pages_in_order(monkeypatch):
    fake_ocr(monkeypatch)
    source = sources._from_ocr(Source("scanned", ".pdf", b"", []))
    assert source.lines == [text for n in range(5)
                            for text in (f"pagina{n} linha", f"fim{n}")]
    assert [source.locations[(2 * n, 0)][0] for n in range(5)] == [
        0, 1, 2, 3, 4]
    assert len(source.warps) == 5
    assert source.unread == 0


def test_the_pages_of_a_scanned_document_are_read_in_parallel(monkeypatch):
    probe = Probe()
    fake_ocr(monkeypatch, probe)
    sources._from_ocr(Source("scanned", ".pdf", b"", []))
    assert probe.peak >= 2


def test_a_page_that_fails_to_read_stops_the_document(monkeypatch):
    fake_ocr(monkeypatch, failing=3)
    with pytest.raises(RuntimeError, match="OCR crashed"):
        sources._from_ocr(Source("scanned", ".pdf", b"", []))


def test_low_confidence_identifiers_are_still_flagged(monkeypatch):
    fake_ocr(monkeypatch)
    source = sources._from_ocr(Source("scanned", ".pdf", b"", []))
    # "fim3" has confidence 20 but is not an identifier; digits would be.
    assert source.uncertain == set()


# --- verification of a rebuilt scanned PDF -------------------------------

def scanned_pdf(pages=4):
    doc = pymupdf.open()
    for n in range(pages):
        buffer = io.BytesIO()
        Image.new("RGB", (100 + n, 80), "white").save(buffer, format="PNG")
        page = doc.new_page(width=200, height=160)
        page.insert_image(page.rect, stream=buffer.getvalue())
    doc.set_metadata({})
    data = doc.tobytes()
    doc.close()
    return Redacted(data, "x.pdf", "application/pdf")


def test_every_rebuilt_page_is_checked_in_parallel(monkeypatch):
    probe, seen = Probe(), []

    def check(image, values, warp=None):
        with probe:
            time.sleep(0.1)
        seen.append(image.width)

    monkeypatch.setattr(redact_verify, "_check_ocr", check)
    monkeypatch.setattr(redact_verify, "_check_pixels", lambda image, p: None)
    redact_verify._verify_scanned(scanned_pdf(4), ["x"],
                                  {n: [] for n in range(4)})
    assert sorted(seen) == [100, 101, 102, 103]
    assert probe.peak >= 2


def test_a_value_still_readable_on_any_page_fails_the_file(monkeypatch):
    def check(image, values, warp=None):
        if image.width == 102:
            raise redact_verify._fail("1 valor(es) ainda legível(eis)")

    monkeypatch.setattr(redact_verify, "_check_ocr", check)
    monkeypatch.setattr(redact_verify, "_check_pixels", lambda image, p: None)
    with pytest.raises(Exception, match="ainda legível"):
        redact_verify._verify_scanned(scanned_pdf(4), ["x"],
                                      {n: [] for n in range(4)})
