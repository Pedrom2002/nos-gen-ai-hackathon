"""Explanatory report: what was masked, why, and who found it.

Masked words that follow each other on the same line form one item
("Maria Conceição Oliveira Santos"). Each item is matched with the
explanation the model gave for it (category, role, reason); items the model
missed and the regex safety net caught are marked as such.

The report object keeps the original values for the local review screen.
The Markdown export hides them by default, so a shared report never leaks
what it describes.
"""

from collections import Counter
from dataclasses import dataclass

from anonimizador.align import MaskedWord

SAFETY_NET = "rede de segurança"
MODEL = "modelo"


@dataclass(frozen=True)
class Span:
    line: int
    first: int
    last: int
    text: str


def _bare(text: str) -> str:
    return "".join(c for c in text.casefold() if c.isalnum())


def masked_spans(original_lines: list[str],
                 masked: list[MaskedWord]) -> list[Span]:
    """Group consecutive masked words of a line into spans."""
    spans = []
    for word in sorted(masked, key=lambda w: (w.line, w.index)):
        last = spans[-1] if spans else None
        if last and last.line == word.line and last.last == word.index - 1:
            spans[-1] = Span(last.line, last.first, word.index, "")
        else:
            spans.append(Span(word.line, word.index, word.index, ""))
    return [
        Span(s.line, s.first, s.last,
             " ".join(original_lines[s.line].split()[s.first:s.last + 1]))
        for s in spans
    ]


def find_entity(text: str, entities: list[dict]) -> dict | None:
    """Return the model entity that best matches a masked span."""
    target = _bare(text)
    best = None
    for entity in entities:
        candidate = _bare(str(entity.get("text", "")))
        if not candidate:
            continue
        if candidate == target:
            return entity
        if best is None and (candidate in target or target in candidate):
            best = entity
    return best


def build_report(original_lines: list[str], result) -> dict:
    """Build the report for a pipeline result (pipeline.Anonymized)."""
    safety = {(w.line, w.index) for w in result.safety_masked}
    items = []
    for span in masked_spans(original_lines, result.masked):
        by_safety_net = all(
            (span.line, i) in safety for i in range(span.first, span.last + 1)
        )
        entity = None if by_safety_net else find_entity(
            span.text, result.entities
        )
        entity = entity or {}
        items.append({
            "line": span.line + 1,
            "text": span.text,
            "words": span.last - span.first + 1,
            "category": entity.get("category", "Identificação"),
            "role": entity.get("role", ""),
            "reason": entity.get("reason") or (
                "Padrão de identificador (email, telefone, IBAN, CC, IP, "
                "GPS)" if by_safety_net else "Identifica uma pessoa"
            ),
            "source": SAFETY_NET if by_safety_net else MODEL,
        })
    summary = {
        "masked_words": sum(item["words"] for item in items),
        "items": len(items),
        "by_category": dict(Counter(i["category"] for i in items)),
        "by_source": dict(Counter(i["source"] for i in items)),
    }
    return {"summary": summary, "items": items}


def to_markdown(report: dict, show_values: bool = False) -> str:
    """Render the report; original values are hidden unless asked for."""
    summary = report["summary"]
    lines = [
        "# Relatório de anonimização",
        "",
        f"{summary['masked_words']} palavras mascaradas em "
        f"{summary['items']} dados.",
        "",
        "| Categoria | Dados |",
        "|---|---|",
    ]
    lines += [f"| {c} | {n} |" for c, n in summary["by_category"].items()]
    lines += [
        "",
        "| Linha | Dado | Categoria | Papel | Razão | Origem |",
        "|---|---|---|---|---|---|",
    ]
    for item in report["items"]:
        value = item["text"] if show_values else " ".join(
            "*" * item["words"]
        ).strip() + f" ({item['words']} palavras)"
        lines.append(
            f"| {item['line']} | {value} | {item['category']} "
            f"| {item['role']} | {item['reason']} | {item['source']} |"
        )
    return "\n".join(lines) + "\n"
