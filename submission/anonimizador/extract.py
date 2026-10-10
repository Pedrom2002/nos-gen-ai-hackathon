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


if __name__ == "__main__":
    for line in extract_lines(sys.argv[1]):
        print(line)
