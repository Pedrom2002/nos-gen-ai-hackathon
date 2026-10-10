"""Remove the masked words from the file itself, so they cannot come back.

- image: the pixels under each word become opaque black (never blur or
  pixelate, which can be reversed); the image is rebuilt from its pixels
  only and saved as PNG, so EXIF (GPS, the embedded thumbnail), XMP and
  text chunks are gone;
- scanned PDF: every page is redacted as an image and a new PDF is built
  from those images only;
- text PDF: PyMuPDF redactions delete the text, image pixels and drawings
  under each word; then hidden text, metadata, attachments, JavaScript,
  links and form data are scrubbed, and the file is saved in full;
- docx: masked words are rewritten inside the runs (formatting kept), and
  comments, images, embedded objects and personal properties are removed.

Every result goes through redact_verify before it is returned. Anything
that cannot be located or verified raises RedactionError: no file is
better than a file that leaks.
"""

import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import PurePath

import pymupdf
from docx import Document
from docx.opc.part import XmlPart
from docx.oxml.ns import qn
from lxml import etree
from PIL import Image, ImageDraw

from anonimizador.align import MaskedWord, mask_token
from anonimizador.report import masked_spans
from anonimizador.sources import SCAN_DPI, Source, docx_paragraphs, own_nodes

DOCX_TYPE = ("application/vnd.openxmlformats-officedocument."
             "wordprocessingml.document")
BLACK = (0, 0, 0)


class RedactionError(RuntimeError):
    """The file could not be redacted safely; only the text is returned."""


@dataclass
class Redacted:
    data: bytes
    filename: str
    media_type: str


def masked_values(lines: list[str], masked: list[MaskedWord]) -> list[str]:
    """The masked values (consecutive masked words of a line)."""
    return [span.text for span in masked_spans(lines, masked)]


def _positions(masked: list[MaskedWord]) -> dict[int, list[int]]:
    per_line: dict[int, set[int]] = {}
    for word in masked:
        per_line.setdefault(word.line, set()).add(word.index)
    return {line: sorted(indices) for line, indices in per_line.items()}


def _missing(line: int) -> RedactionError:
    return RedactionError(f"Não foi possível localizar uma palavra da linha "
                          f"{line + 1} no ficheiro.")


# --- images ---

def word_boxes(source: Source, masked: list[MaskedWord]) -> dict:
    """Page -> boxes to paint; consecutive masked words become one box."""
    boxes: dict[int, list] = {}
    for line, indices in _positions(masked).items():
        run = None
        for k, index in enumerate(indices):
            if (line, index) not in source.locations:
                raise _missing(line)
            page, box = source.locations[(line, index)]
            consecutive = k > 0 and index == indices[k - 1] + 1
            if run and consecutive and run[0] == page:
                run = (page, run[1].union(box))
            else:
                if run:
                    boxes.setdefault(run[0], []).append(run[1])
                run = (page, box)
        if run:
            boxes.setdefault(run[0], []).append(run[1])
    return boxes


def paint(image: Image.Image, boxes: list) -> tuple[Image.Image, list]:
    """Return a new image, built from the pixels only, with black boxes."""
    rgb = image.convert("RGB")
    clean = Image.frombytes("RGB", rgb.size, rgb.tobytes())
    draw = ImageDraw.Draw(clean)
    painted = [box.padded(clean.size) for box in boxes]
    for box in painted:
        draw.rectangle([box.left, box.top, box.right - 1, box.bottom - 1],
                       fill=BLACK)
    return clean, painted


def png_bytes(image: Image.Image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def _image(source: Source, masked: list[MaskedWord]):
    boxes = word_boxes(source, masked).get(0, [])
    image, painted = paint(source.pages[0], boxes)
    return png_bytes(image), {0: (image, painted)}


def _scanned(source: Source, masked: list[MaskedWord]):
    boxes = word_boxes(source, masked)
    doc = pymupdf.open()
    pages = {}
    scale = 72 / SCAN_DPI
    for page_no, page_image in enumerate(source.pages):
        image, painted = paint(page_image, boxes.get(page_no, []))
        pages[page_no] = (image, painted)
        page = doc.new_page(width=image.width * scale,
                            height=image.height * scale)
        page.insert_image(page.rect, stream=png_bytes(image))
    doc.set_metadata({})
    data = doc.tobytes(garbage=4, deflate=True, clean=True)
    doc.close()
    return data, pages


# --- text PDF ---

def _pdf(source: Source, masked: list[MaskedWord]) -> bytes:
    doc = pymupdf.open(stream=source.data, filetype="pdf")
    try:
        for word in masked:
            location = source.locations.get((word.line, word.index))
            if location is None:
                raise _missing(word.line)
            page_no, rect = location
            doc[page_no].add_redact_annot(rect, fill=BLACK)
        for page in doc:
            page.apply_redactions(
                images=pymupdf.PDF_REDACT_IMAGE_PIXELS,
                graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                text=pymupdf.PDF_REDACT_TEXT_REMOVE,
            )
        # Hidden text, attachments, JavaScript, links, form data, metadata
        # and thumbnails could all still hold the values.
        doc.scrub()
        doc.set_metadata({})
        doc.del_xml_metadata()
        doc.set_toc([])
        # A full save with garbage collection drops every unused object;
        # an incremental save would keep the original inside the file.
        return doc.tobytes(garbage=4, deflate=True, clean=True)
    finally:
        doc.close()


# --- DOCX ---

_DROP_REL = ("/image", "/oleObject", "/package", "/comments", "/people",
             "/customXml", "/commentsExtended", "/commentsIds",
             "/commentsExtensible", "/hdphoto", "/media", "/video", "/audio")
_DROP_TAGS = ("w:drawing", "w:pict", "w:object", "w:commentRangeStart",
              "w:commentRangeEnd", "w:commentReference")
_PERSONAL = ("author", "last_modified_by", "title", "subject", "keywords",
             "comments", "category", "identifier", "content_status",
             "version", "language")
_DROP_FILES = re.compile(r"^docProps/(custom\.xml|thumbnail\.\w+)$")


def mask_paragraph(paragraph, indices: set[int], keep_punct: bool) -> None:
    """Replace the given words of a paragraph, keeping run formatting.

    A word split across runs ("Ma" + "ria") gets its mask in the run where
    it starts; its other characters are removed from the other runs.
    """
    chars = []  # (w:t node or None for tabs and breaks, character)
    for node in own_nodes(paragraph):
        if node.tag == qn("w:t"):
            chars.extend((node, c) for c in node.text or "")
        else:
            chars.append((None, " "))
    text = "".join(c for _, c in chars)
    new = [c for _, c in chars]
    for index, match in enumerate(re.finditer(r"\S+", text)):
        if index in indices:
            new[match.start()] = mask_token(match.group(), keep_punct)
            for k in range(match.start() + 1, match.end()):
                new[k] = ""
    by_node: dict = {}
    for (node, _), piece in zip(chars, new):
        if node is not None:
            by_node.setdefault(id(node), [node, []])[1].append(piece)
    for node, pieces in by_node.values():
        node.text = "".join(pieces)
        node.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")


def _strip_docx(document) -> None:
    package = document.part.package
    for part in package.iter_parts():
        element = vars(part).get("_element")
        if element is not None:
            for tag in _DROP_TAGS:
                for node in list(element.iter(qn(tag))):
                    node.getparent().remove(node)
    for part in list(package.iter_parts()):
        for r_id, rel in list(part.rels.items()):
            if any(rel.reltype.endswith(k) for k in _DROP_REL):
                del part.rels[r_id]
    properties = document.core_properties
    for name in _PERSONAL:
        setattr(properties, name, "")
    for part in package.iter_parts():
        # Parts python-docx keeps as bytes were edited as XML (part_root).
        element = vars(part).get("_element")
        if element is not None and not isinstance(part, XmlPart):
            part._blob = etree.tostring(element, encoding="UTF-8",
                                        xml_declaration=True,
                                        standalone=True)


def _clean_zip(data: bytes) -> bytes:
    """Drop custom properties and the thumbnail; blank company/manager."""
    source = zipfile.ZipFile(io.BytesIO(data))
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as target:
        for item in source.infolist():
            if _DROP_FILES.match(item.filename):
                continue
            content = source.read(item.filename)
            if item.filename == "docProps/app.xml":
                content = re.sub(rb"<(Company|Manager)>[^<]*</\1>",
                                 rb"<\1></\1>", content)
            if item.filename in ("[Content_Types].xml", "_rels/.rels"):
                content = re.sub(
                    rb"<[^>]*docProps/(custom\.xml|thumbnail\.\w+)[^>]*/>",
                    b"", content)
            target.writestr(item, content)
    return out.getvalue()


def _docx(source: Source, masked: list[MaskedWord],
          keep_punct: bool) -> bytes:
    document = Document(io.BytesIO(source.data))
    paragraphs = docx_paragraphs(document)
    if len(paragraphs) != len(source.lines):
        raise RedactionError("O DOCX mudou desde a leitura.")
    for line, indices in _positions(masked).items():
        mask_paragraph(paragraphs[line][0], set(indices), keep_punct)
    _strip_docx(document)
    buffer = io.BytesIO()
    document.save(buffer)
    return _clean_zip(buffer.getvalue())


# --- entry point ---

def redact(source: Source, masked: list[MaskedWord], name: str,
           keep_punct: bool = False) -> Redacted:
    """Return the redacted file, verified, or raise RedactionError."""
    from anonimizador import redact_verify

    if not source.redactable:
        raise RedactionError("Este formato só tem saída em texto.")
    stem = PurePath(name).stem or "documento"
    pages: dict = {}
    if source.kind == "image":
        data, pages = _image(source, masked)
        result = Redacted(data, f"{stem}_censurado.png", "image/png")
    elif source.kind == "scanned":
        data, pages = _scanned(source, masked)
        result = Redacted(data, f"{stem}_censurado.pdf", "application/pdf")
    elif source.kind == "pdf":
        result = Redacted(_pdf(source, masked), f"{stem}_censurado.pdf",
                          "application/pdf")
    else:
        result = Redacted(_docx(source, masked, keep_punct),
                          f"{stem}_censurado.docx", DOCX_TYPE)
    redact_verify.verify(source, result, masked, pages, keep_punct)
    return result
