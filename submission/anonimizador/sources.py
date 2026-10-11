"""Read any supported file into clean lines plus where each word is.

The lines go through the usual pipeline (and give submission.txt). The
locations let redact.py remove the masked words from the file itself:

- text (.txt): no file to redact, lines only;
- csv: each row is a line with the cells separated by the delimiter on
  its own (tabular.py); the redacted file is the CSV with the masked cells;
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
import zipfile
from dataclasses import dataclass, field
from difflib import SequenceMatcher

import pymupdf
from docx import Document
from docx.oxml.ns import qn
from PIL import Image

from anonimizador import deskew, ocr
from anonimizador.extract import BinaryFile, clean_lines, decode_text
from anonimizador.tabular import read_csv

TEXT = {".txt", ".csv"}
IMAGE = {".png", ".jpg", ".jpeg", ".webp"}
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


class TooManyPages(ValueError):
    """A scanned PDF longer than MAX_OCR_PAGES."""


class TooLarge(ValueError):
    """A file that is small to upload but huge once opened. The message is
    shown to the user, so it never quotes the document."""


# Each scanned page is OCR'd at 300 dpi (about 26 MB of pixels): cap them.
MAX_OCR_PAGES = 20
# A DOCX is a zip: a few KB can unpack to gigabytes of XML.
MAX_UNPACKED_BYTES = 50 * 1024 * 1024
# A photo of 48 megapixels is normal; 80 is not, and decodes to ~240 MB.
MAX_PIXELS = 80_000_000


@dataclass
class Source:
    kind: str
    suffix: str
    data: bytes
    lines: list[str]
    # (line, word index) -> location, depending on the kind:
    # pdf: (page, pymupdf.Rect); image/scanned: (page, ocr.Box).
    locations: dict = field(default_factory=dict)
    # For each OCR'd page, the deskew.Warp its words were read through
    # (None if flat). Pixels are not kept: see page_images().
    warps: list = field(default_factory=list)
    uncertain: set = field(default_factory=set)
    # Text lines OCR saw on the pages but could not read.
    unread: int = 0
    # The OCR reading before ocr_fix, word for word in step with ``lines``.
    ocr_lines: list = field(default_factory=list)
    # CSV only: the file's delimiter, and the (line, word index) of every
    # separator token in ``lines``; they are never masked.
    delimiter: str = ","
    separators: set = field(default_factory=set)

    @property
    def redactable(self) -> bool:
        return self.kind != "text"

    def page_images(self):
        """Yield the pages as RGB images, decoded again from the original
        bytes one at a time, so a session never holds rendered pages."""
        if self.kind == "image":
            yield ocr.prepare(Image.open(io.BytesIO(self.data)))
        elif self.kind == "scanned":
            with pymupdf.open(stream=self.data, filetype="pdf") as doc:
                for page in doc:
                    yield _render(page)


def _from_ocr(source: Source, straighten: bool = False) -> Source:
    if not ocr.available():
        raise NeedsOcr("O Tesseract com português não está instalado.")

    def read_page(numbered):
        page_no, image = numbered
        # A photographed page is read flattened; boxes stay in that space.
        warp = deskew.page_warp(image) if straighten else None
        readable = warp.flatten(image) if warp else image
        # The evenly lit page is computed once and shared by the OCR pass
        # and the search for lines it skipped (each took it again before).
        lit = ocr.even_light(readable)
        lines, still_unread = ocr.recover_unread(
            readable, ocr.read_image(readable, lit=lit), lit=lit)
        return page_no, warp, lines, len(still_unread)

    # Pages are read a few at a time; they are put together in page order.
    for page_no, warp, lines, unread in ocr.map_pages(
            read_page, enumerate(source.page_images())):
        source.warps.append(warp)
        source.unread += unread
        for words in lines:
            line_no = len(source.lines)
            source.lines.append(" ".join(w.text for w in words))
            for index, word in enumerate(words):
                source.locations[(line_no, index)] = (page_no, word.box)
                if (word.confidence < UNCERTAIN_CONFIDENCE
                        and looks_like_identifier(word.text)):
                    source.uncertain.add((line_no, index))
    source.ocr_lines = list(source.lines)
    return source


def _render(page: pymupdf.Page) -> Image.Image:
    pix = page.get_pixmap(dpi=SCAN_DPI, alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def _pdf(data: bytes) -> Source:
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        texts = [page.get_text() for page in doc]
        if any(not text.strip() for text in texts):
            if doc.page_count > MAX_OCR_PAGES:
                raise TooManyPages(doc.page_count)
            return _from_ocr(Source("scanned", ".pdf", data, []))
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


_MC_FALLBACK = ("{http://schemas.openxmlformats.org/markup-compatibility/"
                "2006}Fallback")


def _unwrap(element) -> None:
    """Replace an element by its children."""
    parent = element.getparent()
    position = parent.index(element)
    for child in list(element):
        parent.insert(position, child)
        position += 1
    parent.remove(element)


def normalise(root) -> None:
    """Put a DOCX part in the plain form both reading and redaction use.

    - tracked changes accepted: deletions dropped, insertions kept;
    - hyperlinks and simple fields unwrapped into plain runs, and field
      codes removed (a "mailto:" target would otherwise survive);
    - for alternate content only the first choice kept, so a text box is
      not read twice.
    """
    for tag in ("w:del", "w:moveFrom", "w:instrText"):
        for element in list(root.iter(qn(tag))):
            element.getparent().remove(element)
    for element in list(root.iter(_MC_FALLBACK)):
        element.getparent().remove(element)
    for tag in ("w:ins", "w:moveTo", "w:hyperlink", "w:fldSimple"):
        for element in list(root.iter(qn(tag))):
            _unwrap(element)


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
    if node.tag == qn("w:t"):
        return node.text or ""
    return _BREAKS[node.tag]


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
        normalise(root)
        for paragraph in root.iter(qn("w:p")):
            text = "".join(node_text(n) for n in own_nodes(paragraph))
            if text.strip():
                found.append((paragraph, text))
    return found


def _check_docx_size(data: bytes) -> None:
    """Refuse a DOCX that unpacks to too much, before reading any of it."""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        unpacked = sum(info.file_size for info in archive.infolist())
    if unpacked > MAX_UNPACKED_BYTES:
        raise TooLarge(
            "O DOCX é demasiado grande depois de descomprimido "
            f"(máximo {MAX_UNPACKED_BYTES // (1024 * 1024)} MB).")


def _check_pixels(data: bytes) -> None:
    """Refuse an image with too many pixels, reading only its header."""
    with Image.open(io.BytesIO(data)) as image:
        width, height = image.size
    if width * height > MAX_PIXELS:
        raise TooLarge(
            f"A imagem tem demasiados píxeis ({width}x{height}): reduza-a "
            f"para menos de {MAX_PIXELS // 1_000_000} milhões.")


def _docx(data: bytes) -> Source:
    _check_docx_size(data)
    document = Document(io.BytesIO(data))
    lines = [text.rstrip() for _, text in docx_paragraphs(document)]
    return Source("docx", ".docx", data, lines)


def load_source(data: bytes, suffix: str) -> Source:
    """Read an uploaded file kept in memory."""
    suffix = suffix.lower()
    if suffix not in SUPPORTED:
        raise UnsupportedFormat(suffix)
    if suffix in TEXT:
        try:
            text = decode_text(data)
        except BinaryFile:
            raise UnsupportedFormat(suffix) from None
        if suffix == ".csv":
            table = read_csv(text)
            return Source("csv", suffix, data, table.lines,
                          delimiter=table.delimiter,
                          separators=table.separators)
        return Source("text", suffix, data, clean_lines(text))
    if suffix == ".pdf":
        return _pdf(data)
    if suffix == ".docx":
        return _docx(data)
    _check_pixels(data)
    return _from_ocr(Source("image", suffix, data, []), straighten=True)
