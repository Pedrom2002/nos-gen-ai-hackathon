import io
import zipfile

import pytest
from docx import Document
from fastapi.testclient import TestClient
from PIL import Image

from anonimizador import sources
from api import main


def docx_bytes(inflate_to=0):
    """A real DOCX; with ``inflate_to`` its document.xml is padded with that
    many bytes of harmless text, which compress to almost nothing."""
    buffer = io.BytesIO()
    document = Document()
    document.add_paragraph("Nome: Rui Costa")
    document.save(buffer)
    if not inflate_to:
        return buffer.getvalue()
    source = zipfile.ZipFile(io.BytesIO(buffer.getvalue()))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zipped:
        for name in source.namelist():
            data = source.read(name)
            if name == "word/document.xml":
                head = data.split(b"</w:body>")[0]
                data = head + b"<!--" + b"a" * inflate_to + b"-->" \
                    + b"</w:body></w:document>"
            zipped.writestr(name, data)
    return out.getvalue()


def test_a_normal_docx_is_read():
    assert sources.load_source(docx_bytes(), ".docx").lines == [
        "Nome: Rui Costa"]


def test_a_docx_that_inflates_far_beyond_its_size_is_refused_fast():
    data = docx_bytes(inflate_to=sources.MAX_UNPACKED_BYTES + 1)
    assert len(data) < 1024 * 1024
    with pytest.raises(sources.TooLarge, match="descomprimido"):
        sources.load_source(data, ".docx")


def test_a_text_file_that_is_really_binary_is_not_a_document():
    data = b"MZ\x90\x00" + bytes(range(256)) * 20
    with pytest.raises(sources.UnsupportedFormat):
        sources.load_source(data, ".txt")


def test_text_with_accents_and_other_encodings_is_still_read():
    assert sources.load_source("Olá, João".encode("utf-8"), ".txt").lines == [
        "Olá, João"]
    assert sources.load_source("Olá, João".encode("cp1252"), ".txt").lines == [
        "Olá, João"]
    assert sources.load_source("Olá".encode("utf-16"), ".txt").lines == ["Olá"]
    assert sources.load_source(b"a,b\n1,2\n", ".csv").lines == ["a,b", "1,2"]


def test_an_image_with_too_many_pixels_is_refused_before_it_is_decoded():
    buffer = io.BytesIO()
    side = int(sources.MAX_PIXELS ** 0.5) + 10
    Image.new("L", (side, side), 255).save(buffer, format="PNG")
    assert len(buffer.getvalue()) < 1024 * 1024
    with pytest.raises(sources.TooLarge, match="píxeis"):
        sources.load_source(buffer.getvalue(), ".png")


# --- the API -------------------------------------------------------------

@pytest.fixture
def client():
    main.STORE.clear()
    return TestClient(main.app, raise_server_exceptions=False)


def upload(client, data, name="x.txt", mime="text/plain"):
    return client.post("/api/documents", files={"file": (name, data, mime)})


def never(*args, **kwargs):
    raise AssertionError("the model must not be called")


def test_the_api_says_why_a_document_is_too_large(client):
    response = upload(client, docx_bytes(sources.MAX_UNPACKED_BYTES + 1),
                      "x.docx")
    assert response.status_code == 413
    assert "descomprimido" in response.json()["detail"]


def test_the_api_refuses_a_binary_file_named_txt_without_asking_the_model(
        client, monkeypatch):
    monkeypatch.setattr(main, "generate_fn", never)
    response = upload(client, b"MZ\x90\x00" + bytes(range(256)) * 20)
    assert response.status_code == 415


def test_a_document_with_too_many_words_is_refused_before_the_model(
        client, monkeypatch):
    monkeypatch.setattr(main, "generate_fn", never)
    monkeypatch.setattr(main, "MAX_WORDS", 5)
    response = upload(client, b"um dois tres quatro cinco seis sete")
    assert response.status_code == 413
    assert "palavras" in response.json()["detail"]
