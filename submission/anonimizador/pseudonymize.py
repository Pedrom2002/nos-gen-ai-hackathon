"""Pseudonymisation and the "Anonymizing Prompts" gateway.

Instead of asterisks, each masked value gets a consistent placeholder
("Maria Santos" -> [PESSOA_1] everywhere). The document and the user's
question are sent to the language model with placeholders only; the
placeholders in its answer are then replaced back with the real values, so
the model never sees a real personal datum.

The placeholder table only lives in memory and is never written to disk.
"""

import re
from dataclasses import dataclass, field

from anonimizador.llm import DEFAULT_MODEL, generate
from anonimizador.report import find_entity, masked_spans

TAGS = {
    "Pessoa": "PESSOA",
    "Contacto": "CONTACTO",
    "Identificação": "ID",
    "Financeiro": "FINANCEIRO",
    "Biométrico": "BIOMETRICO",
}
_PLACEHOLDER = re.compile(r"\[[A-Z]+_\d+\]")
_TOKEN_SPLIT = re.compile(r"(\s+)")

GATEWAY_PROMPT = """\
Responde em português à pergunta sobre o documento abaixo. Os dados \
pessoais foram substituídos por marcadores como [PESSOA_1] ou [ID_2]. Usa \
os marcadores exatamente como aparecem, sem tentar adivinhar os valores.

DOCUMENTO:
{document}

PERGUNTA: {question}
"""


@dataclass
class Pseudonymized:
    lines: list[str]
    table: dict[str, str] = field(default_factory=dict)  # placeholder -> value

    def protect(self, text: str) -> str:
        """Replace known values in free text (e.g. the question)."""
        for placeholder, value in sorted(self.table.items(),
                                         key=lambda kv: -len(kv[1])):
            text = text.replace(value, placeholder)
        return text

    def restore(self, text: str) -> str:
        """Put the real values back in place of the placeholders."""
        return _PLACEHOLDER.sub(
            lambda m: self.table.get(m.group(0), m.group(0)), text
        )


def _strip_punct(text: str) -> tuple[str, str, str]:
    match = re.match(r"^([(\[\"'«]*)(.*?)([)\]\"'».,;:!?]*)$", text)
    return match.groups()


def pseudonymize(original_lines: list[str], result) -> Pseudonymized:
    """Replace every masked value with a consistent placeholder."""
    out = Pseudonymized(lines=list(original_lines))
    by_value: dict[str, str] = {}
    counters: dict[str, int] = {}
    by_line: dict[int, list] = {}
    for span in masked_spans(original_lines, result.masked):
        by_line.setdefault(span.line, []).append(span)

    for line_no, spans in by_line.items():
        parts = _TOKEN_SPLIT.split(original_lines[line_no])
        word_positions = [i for i, p in enumerate(parts)
                          if p and not p.isspace()]
        for span in sorted(spans, key=lambda s: s.first, reverse=True):
            lead, value, trail = _strip_punct(span.text)
            if value not in by_value:
                entity = find_entity(value, result.entities) or {}
                tag = TAGS.get(entity.get("category", ""), "DADO")
                counters[tag] = counters.get(tag, 0) + 1
                by_value[value] = f"[{tag}_{counters[tag]}]"
                out.table[by_value[value]] = value
            first = word_positions[span.first]
            last = word_positions[span.last]
            parts[first:last + 1] = [f"{lead}{by_value[value]}{trail}"]
        out.lines[line_no] = "".join(parts)
    return out


def ask(original_lines: list[str], result, question: str,
        model: str = DEFAULT_MODEL, generate_fn=generate) -> dict:
    """Answer a question about the document without exposing personal data.

    Returns what the model saw (document and question with placeholders),
    its raw answer, and the answer with the real values restored.
    """
    pseudo = pseudonymize(original_lines, result)
    safe_question = pseudo.protect(question)
    prompt = GATEWAY_PROMPT.format(
        document="\n".join(pseudo.lines), question=safe_question
    )
    raw = generate_fn(prompt, model=model)
    return {
        "model_saw": prompt,
        "model_answer": raw,
        "answer": pseudo.restore(raw),
        "placeholders": len(pseudo.table),
    }
