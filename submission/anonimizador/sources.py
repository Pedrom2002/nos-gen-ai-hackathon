"""Read any supported file into clean lines plus where each word is.

The lines go through the usual pipeline (and give submission.txt). The
locations let redact.py remove the masked words from the file itself:

- text (.txt, .csv): no file to redact, lines only;
- pdf: a PDF with a text layer; each word has a page and a rectangle;
- scanned: a PDF where a page has no text; every page is rendered and read
  by OCR, and the redacted PDF is rebuilt from images;
- image (.png, .jpg, .jpeg): OCR; each word has a pixel box;
- docx: each line is a paragraph; words are found again by position.

Text PDFs keep exactly the lines of extract.py, so the official document
is read as before.
"""

import io
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher

import pymupdf
from docx import Document
from docx.oxml.ns import qn
from PIL import Image

from anonimizador import deskew, ocr
from anonimizador.extract import clean_lines, decode_text

TEXT = {".txt", ".csv"}
IMAGE = {".png", ".jpg", ".jpeg"}
SUPPORTED = TEXT | IMAGE | {".pdf", ".docx"}
SCAN_DPI = 300
# OCR words below this confidence that look like identifiers are masked as
# a precaution: OCR misreads "@" or digits ("maria@x.pt" -> "mariaQx.pt"),
# which the model and the patterns may then miss. Short numbers ("72kg",
# "50mg", "BRCA1") are left alone: no identifier is that short.
UNCERTAIN_CONFIDENCE = 80
_DOMAIN = re.compile(r"[^\W\d_]\.[^\W\d_]{2,}")


def looks_like_identifier(word: str) -> bool:
    return (sum(c.isdigit() for c in word) >= 3 or "@" in word
            or bool(_DOMAIN.search(word)))


class UnsupportedFormat(ValueError):
    pass


class NeedsOcr(RuntimeError):
    """The file needs OCR but Tesseract with Portuguese is not installed."""


@dataclass
class Source:
    kind: str
    suffix: str
    data: bytes
    lines: list[str]
    # (line, word index) -> location, depending on the kind:
    # pdf: (page, pymupdf.Rect); image/scanned: (page, ocr.Box).
    locations: dict = field(default_factory=dict)
    # Rendered pages (image/scanned), already rotated and RGB, and for each
    # one the deskew.Warp its words were read through (None if flat).
    pages: list = field(default_factory=list)
    warps: list = field(default_factory=list)
    uncertain: set = field(default_factory=set)
    # Text lines OCR saw on the pages but could not read.
    unread: int = 0

    @property
    def redactable(self) -> bool:
        return self.kind != "text"


def _from_ocr(kind: str, suffix: str, data: bytes,
              images: list[Image.Image], straighten: bool = False) -> Source:
    if not ocr.available():
        raise NeedsOcr("O Tesseract com português não está instalado.")
    source = Source(kind, suffix, data, [], pages=images)
    for page_no, image in enumerate(images):
        # A photographed page is read flattened; boxes stay in that space.
        warp = deskew.page_warp(image) if straighten else None
        source.warps.append(warp)
        readable = warp.flatten(image) if warp else image
        lines = ocr.read_image(readable)
        source.unread += ocr.unread_lines(readable, lines)
        for words in lines:
            line_no = len(source.lines)
            source.lines.append(" ".join(w.text for w in words))
            for index, word in enumerate(words):
                source.locations[(line_no, index)] = (page_no, word.box)
                if (word.confidence < UNCERTAIN_CONFIDENCE
                        and looks_like_identifier(word.text)):
                    source.uncertain.add((line_no, index))
    return source


def _render(page: pymupdf.Page) -> Image.Image:
    pix = page.get_pixmap(dpi=SCAN_DPI, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def _pdf(data: bytes) -> Source:
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        texts = [page.get_text() for page in doc]
        if any(not text.strip() for text in texts):
            return _from_ocr("scanned", ".pdf", data,
                             [_render(page) for page in doc])
        lines = clean_lines("\n".join(texts))
        words = [(page.number, pymupdf.Rect(w[:4]), w[4])
                 for page in doc for w in page.get_text("words", sort=False)]
    source = Source("pdf", ".pdf", data, lines)
    tokens = [(line_no, index, word)
              for line_no, line in enumerate(lines)
              for index, word in enumerate(line.split())]
    matcher = SequenceMatcher(None, [t[2] for t in tokens],
                              [w[2] for w in words], autojunk=False)
    for block in matcher.get_matching_blocks():
        for k in range(block.size):
            line_no, index, _ = tokens[block.a + k]
            page_no, rect, _ = words[block.b + k]
            source.locations[(line_no, index)] = (page_no, rect)
    return source


# --- DOCX ---

_BREAKS = {qn("w:tab"): "\t", qn("w:br"): " ", qn("w:cr"): " ",
           qn("w:noBreakHyphen"): "-"}


def resolve_changes(root) -> None:
    """Accept tracked changes: drop deletions, keep insertions as text."""
    for tag in ("w:del", "w:moveFrom"):
        for element in list(root.iter(qn(tag))):
            element.getparent().remove(element)
    for tag in ("w:ins", "w:moveTo"):
        for element in list(root.iter(qn(tag))):
            parent = element.getparent()
            position = parent.index(element)
            for child in list(element):
                parent.insert(position, child)
                position += 1
            parent.remove(element)


def own_nodes(paragraph) -> list:
    """Text nodes of a paragraph, without the ones of nested paragraphs
    (text boxes), in order."""
    nodes = []
    stack = list(reversed(list(paragraph)))
    while stack:
        element = stack.pop()
        if element.tag == qn("w:p"):
            continue
        if element.tag == qn("w:t") or element.tag in _BREAKS:
            nodes.append(element)
        stack.extend(reversed(list(element)))
    return nodes


def node_text(node) -> str:
    return node.text or "" if node.tag == qn("w:t") else _BREAKS[node.tag]


def docx_roots(document) -> list:
    """Parts with text, in reading order: headers, body, footers,
    footnotes and endnotes. Each part appears once."""
    parts, seen = [], set()

    def add(part):
        if part is not None and id(part) not in seen:
            seen.add(id(part))
            parts.append(part)

    for section in document.sections:
        for header in (section.first_page_header, section.header,
                       section.even_page_header):
            if header._has_definition:
                add(header.part)
    add(document.part)
    for section in document.sections:
        for footer in (section.first_page_footer, section.footer,
                       section.even_page_footer):
            if footer._has_definition:
                add(footer.part)
    for part in document.part.package.iter_parts():
        if str(part.partname).endswith(("/footnotes.xml", "/endnotes.xml")):
            add(part)
    return parts


def part_root(part):
    """The XML element of a part (python-docx keeps some parts as bytes)."""
    element = getattr(part, "_element", None)
    if element is None:
        from docx.oxml import parse_xml
        element = parse_xml(part.blob)
        part._element = element
    return element


def docx_paragraphs(document) -> list:
    """Every non-empty paragraph, in reading order, with its text."""
    found = []
    for part in docx_roots(document):
        root = part_root(part)
        resolve_changes(root)
        for paragraph in root.iter(qn("w:p")):
            text = "".join(node_text(n) for n in own_nodes(paragraph))
            if text.strip():
                found.append((paragraph, text))
    return found


def _docx(data: bytes) -> Source:
    document = Document(io.BytesIO(data))
    lines = [text.rstrip() for _, text in docx_paragraphs(document)]
    return Source("docx", ".docx", data, lines)


def load_source(data: bytes, suffix: str) -> Source:
    """Read an uploaded file kept in memory."""
    suffix = suffix.lower()
    if suffix not in SUPPORTED:
        raise UnsupportedFormat(suffix)
    if suffix in TEXT:
        return Source("text", suffix, data, clean_lines(decode_text(data)))
    if suffix == ".pdf":
        return _pdf(data)
    if suffix == ".docx":
        return _docx(data)
    image = ocr.prepare(Image.open(io.BytesIO(data)))
    return _from_ocr("image", suffix, data, [image], straighten=True)
