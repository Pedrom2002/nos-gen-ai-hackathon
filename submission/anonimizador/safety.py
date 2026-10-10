"""Regex safety net applied after the model.

It only adds masks, never removes one, and only for patterns that always
identify a person or an account: emails, Portuguese phone numbers, IBANs
from any country, Cartão de Cidadão numbers, IP addresses and GPS
coordinates. Patterns run over the whole document, so an IBAN split across
two lines is still found.
"""

import re
import unicodedata

from anonimizador.align import MaskedWord, mask_token

MASK = "*"
_TOKEN_SPLIT = re.compile(r"(\s+)")

# A phone number needs a "+351" prefix, the usual "9xx xxx xxx" grouping or
# a phone label nearby: a bare 9-digit number may be an invoice or a NIF.
_PHONE_LABEL = r"(?i:tel\w*|tlm|m[óo]vel|contacto|phone)\b[^\n\d]{0,15}"
_OCTET = r"(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)"

# When a pattern has a group named "v", only that group is masked (the
# label stays visible).
PATTERNS = {
    "email": r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+",
    "phone_prefixed": r"(?<![\d+])\+351[\s-]?[29]\d{2}(?:[\s-]?\d{3}){2}"
                      r"(?!\d)",
    "phone_grouped": r"(?<![\d+])[29]\d{2}[\s-]\d{3}[\s-]\d{3}(?!\d)",
    "phone_labelled": _PHONE_LABEL + r"(?P<v>[29]\d{8})(?!\d)",
    "cartao_cidadao": r"\b\d{8}(?:\s?\d\s?|-\d)[A-Z]{2}\d\b",
    # Only after "IP": "1.250.000.000 euros" or "versão 2.10.3.1" stay.
    "ip": r"\bIP\b[^\n\d]{0,25}(?P<v>(?:" + _OCTET + r"\.){3}" + _OCTET
          + r")(?![\d.])",
    "gps": r"\b\d{1,3}\.\d{3,}\s?[NS],?\s+\d{1,3}\.\d{3,}\s?[EWO]\b",
}
_COMPILED = [re.compile(p) for p in PATTERNS.values()]


def _pattern_spans(text: str) -> list[tuple[int, int]]:
    spans = []
    for pattern in _COMPILED:
        for match in pattern.finditer(text):
            group = "v" if "v" in pattern.groupindex else 0
            spans.append(match.span(group))
    return spans


# IBANs are not a regex: the length depends on the country. Total length per
# country code, from the SWIFT IBAN registry.
IBAN_LENGTHS = {
    "AD": 24, "AE": 23, "AL": 28, "AT": 20, "AZ": 28, "BA": 20, "BE": 16,
    "BG": 22, "BH": 22, "BI": 27, "BR": 29, "BY": 28, "CH": 21, "CR": 22,
    "CY": 28, "CZ": 24, "DE": 22, "DJ": 27, "DK": 18, "DO": 28, "EE": 20,
    "EG": 29, "ES": 24, "FI": 18, "FK": 18, "FO": 18, "FR": 27, "GB": 22,
    "GE": 22, "GI": 23, "GL": 18, "GR": 27, "GT": 28, "HN": 28, "HR": 21,
    "HU": 28, "IE": 22, "IL": 23, "IQ": 23, "IS": 26, "IT": 27, "JO": 30,
    "KW": 30, "KZ": 20, "LB": 28, "LC": 32, "LI": 21, "LT": 20, "LU": 20,
    "LV": 21, "LY": 25, "MC": 27, "MD": 24, "ME": 22, "MK": 19, "MN": 20,
    "MR": 27, "MT": 31, "MU": 30, "NI": 28, "NL": 18, "NO": 15, "OM": 23,
    "PK": 24, "PL": 28, "PS": 29, "PT": 25, "QA": 29, "RO": 24, "RS": 22,
    "RU": 33, "SA": 24, "SC": 31, "SD": 18, "SE": 24, "SI": 19, "SK": 24,
    "SM": 27, "SO": 23, "ST": 25, "SV": 28, "TL": 23, "TN": 24, "TR": 26,
    "UA": 29, "VA": 22, "VG": 24, "XK": 20, "YE": 30,
}
# Country code, optional space ("PT 50"), check digits.
_IBAN_START = re.compile(r"(?<![A-Z0-9])([A-Z]{2})\s?(\d{2})")
_IBAN_CHARS = frozenset("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ")
# Shortest account part (Norway has 11); a shorter run is not an IBAN.
_MIN_BBAN = 10


def plain(word: str) -> str:
    """Undo styling: math bold/italic letters become plain, and combining
    marks (strike-through, underline) are dropped."""
    decomposed = unicodedata.normalize("NFKD", word)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _word_spans(lines: list[str]) -> tuple[str, list[tuple]]:
    """Join the plain words and return (text, [(start, end, line, index)]).

    Words are normalised one by one, so word positions stay the same as in
    the original lines.
    """
    spans = []
    parts = []
    offset = 0
    for line_no, line in enumerate(lines):
        words = [plain(word) or word for word in line.split()]
        for index, word in enumerate(words):
            spans.append((offset, offset + len(word), line_no, index))
            offset += len(word) + 1
        parts.append(" ".join(words))
        offset += 0 if words else 1
    return "\n".join(parts), spans


def _account_chars(text: str, pos: int, limit: int) -> list[tuple[str, int]]:
    """Read up to ``limit`` IBAN characters from ``pos``, skipping the spaces,
    line breaks and hyphens between groups. Returns (char, end) pairs."""
    chars = []
    gap = 0
    while pos < len(text) and len(chars) < limit:
        char = text[pos]
        if char in _IBAN_CHARS:
            chars.append((char, pos + 1))
            gap = 0
        elif char in " \n-" and gap < 2:
            gap += 1
        else:
            break
        pos += 1
    return chars


def _iban_spans(text: str) -> list[tuple[int, int]]:
    """Return (start, end) of every IBAN in the text, from any country.

    The registry table covers every country that uses IBANs. Up to the
    country's exact length is read, so the next word is never swallowed.
    The checksum is not required: fictional or mistyped IBANs still point to
    an account, and validating it would let them leak. Codes outside the
    registry are not IBANs, so ordinary text ("CC 11384572 9 ZX3") cannot
    match by chance.
    """
    spans = []
    for match in _IBAN_START.finditer(text):
        length = IBAN_LENGTHS.get(match.group(1))
        if not length:
            continue
        chars = _account_chars(text, match.end(), length - 4)
        if len(chars) >= _MIN_BBAN:
            spans.append((match.start(), chars[-1][1]))
    return spans


def find_identifier_words(lines: list[str]) -> set[tuple[int, int]]:
    """Return (line, word index) of every word inside a matched pattern."""
    text, spans = _word_spans(lines)
    matches = _pattern_spans(text) + _iban_spans(text)
    found = set()
    for match_start, match_end in matches:
        for start, end, line_no, index in spans:
            if start < match_end and end > match_start:
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
