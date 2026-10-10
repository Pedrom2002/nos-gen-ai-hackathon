"""Align the model output with the original text, word by word.

The language model decides which words are sensitive, but it may also
rewrite, merge or drop parts of the document. This module only trusts the
masks: every original word is kept exactly as it was unless the model
replaced it with asterisks. Line breaks and spacing always come from the
original text, so the output keeps the original formatting.
"""

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

MASK = "*"
_TOKEN_SPLIT = re.compile(r"(\s+)")
_EDGE_PUNCT = re.compile(r"^([(\[\"'«]*)(.*?)([)\]\"'».,;:!?]*)$")


@dataclass(frozen=True)
class MaskedWord:
    """A word of the original text that was replaced by a mask."""

    line: int
    index: int
    text: str


@dataclass
class AlignResult:
    lines: list[str]
    masked: list[MaskedWord]


def _is_mask(token: str) -> bool:
    return MASK in token


def _norm(token: str) -> str:
    return MASK if _is_mask(token) else token.casefold()


def mask_token(token: str, keep_punct: bool = False) -> str:
    """Return the masked form of a word.

    By default the whole word becomes a single asterisk. With
    ``keep_punct`` the surrounding punctuation is kept ("Flores," -> "*,").
    """
    if not keep_punct:
        return MASK
    lead, core, trail = _EDGE_PUNCT.match(token).groups()
    return f"{lead}{MASK}{trail}" if core else MASK


def _flatten(lines: list[str]) -> list[tuple[int, int, str]]:
    return [
        (line_no, index, word)
        for line_no, line in enumerate(lines)
        for index, word in enumerate(line.split())
    ]


def _masked_positions(original: list[str], model: list[str],
                      line_of: list[int]) -> set[int]:
    """Return the indexes of original words that the model masked."""
    orig_norm = [_norm(w) for w in original]
    model_norm = [_norm(w) for w in model]
    matcher = SequenceMatcher(None, orig_norm, model_norm, autojunk=False)
    masked = set()
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag != "replace":
            # equal: unchanged; delete: dropped by the model, keep it;
            # insert: words the model added, ignore them.
            continue
        block = model[j1:j2]
        if all(_is_mask(w) for w in block):
            # "Maria Santos" -> "*" still masks both words, but a collapsed
            # mask never spreads past the end of the line where it starts,
            # so a line the model dropped is not masked by accident.
            rest_of_line = sum(
                1 for i in range(i1, i2) if line_of[i] == line_of[i1]
            )
            span = max(j2 - j1, rest_of_line)
            masked.update(range(i1, min(i2, i1 + span)))
        elif i2 - i1 == j2 - j1:
            masked.update(
                i for i, w in zip(range(i1, i2), block) if _is_mask(w)
            )
        elif any(_is_mask(w) for w in block):
            kept = {w.casefold() for w in block if not _is_mask(w)}
            masked.update(
                i for i in range(i1, i2) if original[i].casefold() not in kept
            )
    return masked


def _render(line: str, masked_idx: set[int], keep_punct: bool) -> str:
    parts = _TOKEN_SPLIT.split(line)
    word_no = 0
    for pos, part in enumerate(parts):
        if not part or part.isspace():
            continue
        if word_no in masked_idx:
            parts[pos] = mask_token(part, keep_punct)
        word_no += 1
    return "".join(parts)


def align(original_lines: list[str], model_lines: list[str],
          keep_punct: bool = False) -> AlignResult:
    """Apply the model's masks to the original lines.

    Only whole words are replaced, by a single asterisk each. Any other
    change made by the model (rewording, merged or missing lines) is ignored.
    """
    orig_words = _flatten(original_lines)
    model_words = [w for line in model_lines for w in line.split()]
    positions = _masked_positions(
        [w for _, _, w in orig_words],
        model_words,
        [line_no for line_no, _, _ in orig_words],
    )

    per_line: dict[int, set[int]] = {}
    masked = []
    for pos in sorted(positions):
        line_no, index, word = orig_words[pos]
        per_line.setdefault(line_no, set()).add(index)
        masked.append(MaskedWord(line_no, index, word))

    lines = [
        _render(line, per_line.get(line_no, set()), keep_punct)
        for line_no, line in enumerate(original_lines)
    ]
    return AlignResult(lines=lines, masked=masked)
