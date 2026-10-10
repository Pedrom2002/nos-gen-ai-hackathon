"""Regex safety net applied after the model.

It only adds masks, never removes one, and only for patterns that always
identify a person or an account: emails, Portuguese phone numbers, IBANs,
Cartão de Cidadão numbers, IP addresses and GPS coordinates. Patterns run
over the whole document, so an IBAN split across two lines is still found.
"""

import re

from anonimizador.align import MaskedWord, mask_token

MASK = "*"
_TOKEN_SPLIT = re.compile(r"(\s+)")

PATTERNS = {
    "email": r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+",
    "mobile": r"(?<![\d+])(?:\+351[\s-]?)?9[1236]\d(?:[\s-]?\d{3}){2}(?!\d)",
    "landline": r"(?<![\d+])(?:\+351[\s-]?2\d{8}|2\d{2}[\s-]\d{3}[\s-]\d{3})"
                r"(?!\d)",
    "iban": r"\bPT50(?:\s*\d){21}(?!\d)",
    "cartao_cidadao": r"\b\d{8}(?:\s?\d\s?|-\d)[A-Z]{2}\d\b",
    "ip": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
    "gps": r"\b\d{1,3}\.\d{3,}\s?[NS],?\s+\d{1,3}\.\d{3,}\s?[EWO]\b",
}
_COMBINED = re.compile("|".join(f"(?:{p})" for p in PATTERNS.values()))


def _word_spans(lines: list[str]) -> tuple[str, list[tuple]]:
    """Join the lines and return (text, [(start, end, line, index)])."""
    spans = []
    offset = 0
    for line_no, line in enumerate(lines):
        for index, match in enumerate(re.finditer(r"\S+", line)):
            spans.append(
                (offset + match.start(), offset + match.end(), line_no, index)
            )
        offset += len(line) + 1
    return "\n".join(lines), spans


def find_identifier_words(lines: list[str]) -> set[tuple[int, int]]:
    """Return (line, word index) of every word inside a matched pattern."""
    text, spans = _word_spans(lines)
    found = set()
    for match in _COMBINED.finditer(text):
        for start, end, line_no, index in spans:
            if start < match.end() and end > match.start():
                found.add((line_no, index))
    return found


def apply_safety_net(original_lines: list[str], output_lines: list[str],
                     keep_punct: bool = False
                     ) -> tuple[list[str], list[MaskedWord]]:
    """Mask pattern matches the model left visible.

    ``output_lines`` must have the same words per line as the original
    (the output of ``align``). Returns the new lines and the added masks.
    """
    targets = find_identifier_words(original_lines)
    added = []
    result = []
    for line_no, (original, output) in enumerate(
            zip(original_lines, output_lines)):
        words = original.split()
        parts = _TOKEN_SPLIT.split(output)
        word_no = 0
        for pos, part in enumerate(parts):
            if not part or part.isspace():
                continue
            if (line_no, word_no) in targets and MASK not in part:
                parts[pos] = mask_token(words[word_no], keep_punct)
                added.append(MaskedWord(line_no, word_no, words[word_no]))
            word_no += 1
        result.append("".join(parts))
    return result, added
