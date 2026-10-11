"""Text extraction from PDF documents.

The output keeps the original line layout, with two normalisations required
by the challenge: empty lines are removed and trailing whitespace is
stripped from every line.
"""

import sys
from pathlib import Path

import pymupdf


def clean_lines(text: str) -> list[str]:
    """Split text into lines, strip trailing spaces and drop empty lines."""
    lines = (line.rstrip() for line in text.splitlines())
    return [line for line in lines if line.strip()]


def extract_lines(pdf_path: str | Path) -> list[str]:
    """Return the non-empty lines of a PDF, in reading order."""
    with pymupdf.open(pdf_path) as doc:
        # Join with a newline so the last line of a page never merges
        # with the first line of the next one.
        text = "\n".join(page.get_text() for page in doc)
    return clean_lines(text)


class BinaryFile(ValueError):
    """A file called text that is not text (an executable, an archive...)."""


def decode_text(data: bytes) -> str:
    """Decode a text file: UTF-16 (with BOM), UTF-8 or Windows-1252.

    Raises BinaryFile for a file with NUL bytes that is not UTF-16.
    """
    if data[:2] in (b"\xff\xfe", b"\xfe\xff"):
        return data.decode("utf-16")
    if b"\x00" in data[:8192]:
        raise BinaryFile("not a text file")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")


def read_bytes(data: bytes, suffix: str) -> list[str]:
    """Return the clean lines of an uploaded file kept in memory."""
    if suffix.lower() == ".pdf":
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            text = "\n".join(page.get_text() for page in doc)
        return clean_lines(text)
    return clean_lines(decode_text(data))


def read_document(path: str | Path) -> list[str]:
    """Return the clean lines of a PDF or a plain text file (.txt, .csv)."""
    path = Path(path)
    if path.suffix.lower() == ".pdf":
        return extract_lines(path)
    return clean_lines(decode_text(path.read_bytes()))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m anonimizador.extract <file.pdf>")
    for line in extract_lines(sys.argv[1]):
        print(line)
