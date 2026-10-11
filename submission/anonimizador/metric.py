"""Local replica of the challenge metrics.

The official evaluation logs report two numbers:

- Similarity: share of words that match the hidden reference exactly.
- Accuracy: share of the words that should be censored that are fully
  censored (a ``*``, with any punctuation that was glued to the word).

The official way of combining them is not public, so ``score`` is their
mean. Words are compared by position over the whole document; the output of
``align`` always has the same words per line as the original, so positions
line up with the reference.

Whether the hidden reference writes "Flores," as "*," or as "*" is not
known: is_mask accepts both, so Accuracy only counts what was censored, and
Similarity shows whether the punctuation matches the reference.
"""

import sys
from dataclasses import dataclass, field
from pathlib import Path

MASK = "*"
_PUNCT = ".,;:!?()[]{}\"'«»"


def is_mask(word: str) -> bool:
    """A censored word: "*", or "*" with its punctuation ("*,", "(*,")."""
    return word.strip(_PUNCT) == MASK


@dataclass
class Report:
    similarity: float
    accuracy: float
    score: float
    missed: list[tuple[int, str]] = field(default_factory=list)
    extra: list[tuple[int, str]] = field(default_factory=list)


def _words(lines: list[str]) -> list[tuple[int, str]]:
    return [
        (line_no, word)
        for line_no, line in enumerate(lines, 1)
        for word in line.split()
    ]


def evaluate(output_lines: list[str], gold_lines: list[str],
             original_lines: list[str] | None = None) -> Report:
    """Compare an output with the reference, word by word.

    ``missed`` lists sensitive words left visible and ``extra`` words masked
    without need, as (line number, original word). The original text is
    only used to show which word was involved.
    """
    out = _words(output_lines)
    gold = _words(gold_lines)
    orig = _words(original_lines) if original_lines else gold
    total = max(len(out), len(gold))
    out_words = [w for _, w in out] + [""] * (total - len(out))

    same = sum(o == g for o, (_, g) in zip(out_words, gold))
    to_mask = [i for i, (_, g) in enumerate(gold) if is_mask(g)]
    masked_ok = sum(is_mask(out_words[i]) for i in to_mask)

    missed = [orig[i] for i in to_mask if not is_mask(out_words[i])]
    extra = [
        orig[i] for i, (_, g) in enumerate(gold)
        if not is_mask(g) and is_mask(out_words[i])
    ]
    similarity = same / total if total else 1.0
    accuracy = masked_ok / len(to_mask) if to_mask else 1.0
    return Report(
        similarity=similarity,
        accuracy=accuracy,
        score=(similarity + accuracy) / 2,
        missed=missed,
        extra=extra,
    )


def read_lines(path: str | Path) -> list[str]:
    return Path(path).read_text(encoding="utf-8").splitlines()


def format_report(report: Report) -> str:
    lines = [
        f"Similarity: {report.similarity:.2%}",
        f"Accuracy:   {report.accuracy:.2%}",
        f"Score:      {report.score:.2%} (mean of both)",
    ]
    for label, items in (("Missed", report.missed),
                         ("Extra", report.extra)):
        if items:
            words = ", ".join(f"L{n} {w}" for n, w in items)
            lines.append(f"{label} ({len(items)}): {words}")
    return "\n".join(lines)


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        sys.exit("usage: python -m anonimizador.metric <output.txt> "
                 "<gold.txt> [original.txt]")
    original = read_lines(sys.argv[3]) if len(sys.argv) == 4 else None
    print(format_report(evaluate(
        read_lines(sys.argv[1]), read_lines(sys.argv[2]), original
    )))
