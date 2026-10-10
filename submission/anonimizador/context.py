"""Document context: what kind of document this is, read from all of it.

Some labels only point to a person in a given kind of document. "Matrícula"
or a bare "N.º:" field is a student's number in a school record, but a car
or company registration elsewhere. The context is detected once from the
whole document, and the prompt and the safety net then add the rules for
that context. A document without a detected context is processed exactly
as before.
"""

import re
import unicodedata

# Each context needs at least two distinct terms, so a single mention
# ("Professora universitária na Faculdade de Direito" in a medical report)
# does not change how a document is treated. Terms are written without
# accents and matched on unaccented, lowercase text.
CONTEXT_TERMS = {
    "escolar": (
        r"alun[oa]s?", r"estudantes?", r"turmas?", r"ano letivo",
        r"encarregad[oa]s? de educacao", r"escolas?", r"escolar",
        r"agrupamento de escolas", r"propinas?", r"pautas?",
        r"boletim de (?:notas|avaliacao)", r"diretor(?:a)? de turma",
        r"student", r"school",
    ),
}
MIN_TERMS = 2


def plain_text(text: str) -> str:
    """Lowercase text without accents or styling ("Matrícula" ->
    "matricula", math bold letters -> plain)."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(
        c for c in decomposed if not unicodedata.combining(c)
    ).lower()


def detect_contexts(lines: list[str]) -> set[str]:
    """Return the contexts found in the whole document (e.g. {"escolar"})."""
    text = plain_text("\n".join(lines))
    found = set()
    for context, terms in CONTEXT_TERMS.items():
        hits = sum(
            1 for term in terms if re.search(rf"\b{term}\b", text)
        )
        if hits >= MIN_TERMS:
            found.add(context)
    return found
