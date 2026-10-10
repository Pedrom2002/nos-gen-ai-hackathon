"""Leak check: no masked value may still be readable in the final text.

Each masked value (consecutive masked words of a line) is looked up in the
anonymised output, ignoring case, accents, styling and punctuation:

- values with several words ("Maria Santos") leak if the same words appear
  together, unmasked, anywhere in the output;
- single words leak only if they look like identifiers (they contain a
  digit or "@"). A lone city or first name may legitimately stay visible
  elsewhere ("Centro Médico Lisboa"), so it is not counted as a leak.
"""

import unicodedata

from anonimizador.align import MaskedWord
from anonimizador.report import masked_spans


def _key(word: str) -> str:
    decomposed = unicodedata.normalize("NFKD", word.casefold())
    return "".join(c for c in decomposed if c.isalnum() or c == "@")


def _keys(text: str) -> list[str]:
    return [k for k in (_key(w) for w in text.split()) if k]


def _contains(haystack: list[str], needle: list[str]) -> bool:
    size = len(needle)
    return any(haystack[i:i + size] == needle
               for i in range(len(haystack) - size + 1))


def check_leaks(original_lines: list[str], output_lines: list[str],
                masked: list[MaskedWord]) -> dict:
    """Return how many masked values were checked and which ones leaked."""
    output_keys = [_keys(line) for line in output_lines]
    checked = 0
    leaks = []
    seen = set()
    for span in masked_spans(original_lines, masked):
        needle = _keys(span.text)
        single = len(needle) == 1
        if not needle or tuple(needle) in seen:
            continue
        if single and not any(c.isdigit() or c == "@" for c in needle[0]):
            continue
        seen.add(tuple(needle))
        checked += 1
        for line_no, keys in enumerate(output_keys):
            if _contains(keys, needle):
                leaks.append({"line": line_no + 1, "text": span.text})
                break
    return {"checked": checked, "leaks": leaks}
