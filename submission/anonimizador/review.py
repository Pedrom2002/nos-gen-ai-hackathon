"""Manual review: the person decides, the model only proposes.

Each detected item (see report.build_report) can be kept visible. Kept
items are unmasked word by word; everything else stays exactly as the
pipeline produced it, so the layout rules still hold.
"""

import re

from anonimizador.align import MaskedWord, mask_token

_TOKEN_SPLIT = re.compile(r"(\s+)")


def apply_decisions(original_lines: list[str], masked: list[MaskedWord],
                    items: list[dict], keep_ids: set[str],
                    keep_punct: bool = False
                    ) -> tuple[list[str], list[MaskedWord]]:
    """Return the output lines and masked words after the review.

    ``items`` are report items (with id, line, first, last); the ones whose
    id is in ``keep_ids`` are shown again. Unknown ids raise KeyError so a
    stale screen cannot silently unmask the wrong words.
    """
    by_id = {item["id"]: item for item in items}
    unknown = keep_ids - by_id.keys()
    if unknown:
        raise KeyError(f"unknown items: {sorted(unknown)}")
    kept = {
        (by_id[i]["line"] - 1, index)
        for i in keep_ids
        for index in range(by_id[i]["first"], by_id[i]["last"] + 1)
    }
    remaining = [w for w in masked if (w.line, w.index) not in kept]
    to_mask = {(w.line, w.index) for w in remaining}

    lines = []
    for line_no, line in enumerate(original_lines):
        parts = _TOKEN_SPLIT.split(line)
        word_no = 0
        for pos, part in enumerate(parts):
            if not part or part.isspace():
                continue
            if (line_no, word_no) in to_mask:
                parts[pos] = mask_token(part, keep_punct)
            word_no += 1
        lines.append("".join(parts))
    return lines, remaining
