"""Check a redacted file by reading it back on its own, not trusting redact.

Raises RedactionError when anything could still give a masked value away:

- image: PNG without any metadata; every painted box is pure black in the
  decoded file; a new OCR pass does not find any masked value;
- scanned PDF: no text layer, empty metadata, and each embedded page image
  passes the image checks;
- text PDF: the masked values are not in the extracted text nor, for long
  identifiers, in any decompressed object; metadata, annotations, form
  fields and attachments are gone;
- docx: read again, every line equals the expected masked line; no media,
  comments, custom properties or thumbnail is left; the text of every XML
  part (headers, footnotes, properties...) holds no masked value; author
  fields are empty.

Error messages never quote the values, so they are safe to show and log.
"""

import html
import io
import re
import zipfile

import pymupdf
from docx import Document
from PIL import Image

from anonimizador import ocr
from anonimizador.align import MaskedWord, _render
from anonimizador.redact import RedactionError, Redacted, masked_values
from anonimizador.sources import Source, load_source
from anonimizador.verify import find_values

_PDF_FIELDS = ("title", "author", "subject", "keywords", "creator",
               "producer")
# Raw byte search only for long identifiers: short numbers ("123") also
# appear as coordinates in any PDF content stream.
MIN_RAW_LENGTH = 6


def _fail(reason: str) -> RedactionError:
    return RedactionError(f"Verificação falhou: {reason}.")


def _check_pixels(image: Image.Image, boxes: list) -> None:
    rgb = image.convert("RGB")
    for box in boxes:
        extrema = rgb.crop((box.left, box.top, box.right,
                            box.bottom)).getextrema()
        if any(band != (0, 0) for band in extrema):
            raise _fail("uma zona censurada não está totalmente preta")


def _check_ocr(image: Image.Image, values: list[str]) -> None:
    lines = ocr.line_texts(ocr.read_image(image.convert("RGB")))
    leaked = find_values(values, lines)
    if leaked:
        raise _fail(f"{len(leaked)} valor(es) ainda legível(eis) na imagem")


def _verify_image(redacted: Redacted, values, pages) -> None:
    image = Image.open(io.BytesIO(redacted.data))
    image.load()
    if image.format != "PNG":
        raise _fail("a imagem não é PNG")
    if image.info or image.getexif():
        raise _fail("a imagem ainda tem metadados")
    _check_pixels(image, pages[0][1])
    _check_ocr(image, values)


def _verify_scanned(redacted: Redacted, values, pages) -> None:
    with pymupdf.open(stream=redacted.data, filetype="pdf") as doc:
        if any(doc.metadata.get(k) for k in _PDF_FIELDS):
            raise _fail("o PDF ainda tem metadados")
        for page in doc:
            if page.get_text().strip():
                raise _fail("o PDF tem uma camada de texto")
            images = page.get_images()
            if len(images) != 1:
                raise _fail("página com conteúdo inesperado")
            pix = pymupdf.Pixmap(doc, images[0][0])
            image = Image.frombytes("RGB", (pix.width, pix.height),
                                    pix.samples)
            _check_pixels(image, pages[page.number][1])
            _check_ocr(image, values)


def _raw_tokens(values: list[str]) -> set[bytes]:
    tokens = set()
    for value in values:
        for word in value.split():
            word = re.sub(r"[^\w@.+-]", "", word)
            if len(word) >= MIN_RAW_LENGTH and re.search(r"\d|@", word):
                tokens.add(word.encode())
    return tokens


def _verify_pdf(redacted: Redacted, values) -> None:
    with pymupdf.open(stream=redacted.data, filetype="pdf") as doc:
        lines = [line for page in doc
                 for line in page.get_text().splitlines()]
        if find_values(values, lines):
            raise _fail("há valores mascarados ainda no texto do PDF")
        if any(doc.metadata.get(k) for k in _PDF_FIELDS):
            raise _fail("o PDF ainda tem metadados")
        if doc.embfile_count():
            raise _fail("o PDF ainda tem anexos")
        for page in doc:
            if page.first_annot or page.first_widget:
                raise _fail("o PDF ainda tem anotações ou formulários")
        tokens = _raw_tokens(values)
        for xref in range(1, doc.xref_length()):
            chunk = doc.xref_object(xref).encode("latin-1", "replace")
            if doc.xref_is_stream(xref):
                chunk += doc.xref_stream(xref) or b""
            if any(token in chunk for token in tokens):
                raise _fail("há um identificador num objeto interno do PDF")


def _xml_text(xml: str) -> list[str]:
    """Readable text of an XML part: runs of a paragraph stay glued
    together, every other element boundary separates words."""
    xml = re.sub(r"</w:p>|<w:(br|cr|tab)\b[^>]*/>", "\n", xml)
    xml = re.sub(r"</?w:[^>]*>", "", xml)
    xml = re.sub(r"<[^>]+>", "\n", xml)
    return html.unescape(xml).splitlines()


def _verify_docx(source: Source, redacted: Redacted, values, masked,
                 keep_punct) -> None:
    archive = zipfile.ZipFile(io.BytesIO(redacted.data))
    for name in archive.namelist():
        if re.match(r"word/(media|embeddings)/|word/(comments|people)",
                    name) or re.match(r"docProps/(custom|thumbnail)", name):
            raise _fail("o DOCX ainda tem imagens, comentários ou "
                        "propriedades pessoais")
        if name.endswith((".xml", ".rels")):
            text = archive.read(name).decode("utf-8", "replace")
            if find_values(values, _xml_text(text)):
                raise _fail("há valores mascarados dentro do DOCX")
    per_line: dict[int, set[int]] = {}
    for word in masked:
        per_line.setdefault(word.line, set()).add(word.index)
    expected = [_render(line, per_line.get(n, set()), keep_punct)
                for n, line in enumerate(source.lines)]
    if load_source(redacted.data, ".docx").lines != expected:
        raise _fail("o texto do DOCX não corresponde ao resultado")
    properties = Document(io.BytesIO(redacted.data)).core_properties
    if properties.author or properties.last_modified_by:
        raise _fail("o DOCX ainda tem o autor")


def verify(source: Source, redacted: Redacted, masked: list[MaskedWord],
           pages: dict, keep_punct: bool = False) -> None:
    # The file must not reveal anything the text output does not. A value
    # the reviewer chose to keep visible somewhere is no leak of the file.
    per_line: dict[int, set[int]] = {}
    for word in masked:
        per_line.setdefault(word.line, set()).add(word.index)
    text_output = [_render(line, per_line.get(n, set()), keep_punct)
                   for n, line in enumerate(source.lines)]
    shown = set(find_values(masked_values(source.lines, masked),
                            text_output))
    values = [v for v in masked_values(source.lines, masked)
              if v not in shown]
    if source.kind == "image":
        _verify_image(redacted, values, pages)
    elif source.kind == "scanned":
        _verify_scanned(redacted, values, pages)
    elif source.kind == "pdf":
        _verify_pdf(redacted, values)
    else:
        _verify_docx(source, redacted, values, masked, keep_punct)
