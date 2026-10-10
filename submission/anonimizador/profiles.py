"""Anonymisation profiles: which people stay visible in the output.

The model always masks every person, as the challenge requires, and tags
each entity with the role of the person it belongs to (patient, relative,
contact, professional). A profile then decides which roles are shown
again, so one model answer serves several readers: the challenge output
hides everyone, the "medico" profile shows who treated the patient but
not the patient.

A profile can only restore words the model masked, never mask more, so it
cannot make a model mistake worse.
"""

import re
from dataclasses import dataclass

MASK = "*"
_TOKEN_SPLIT = re.compile(r"(\s+)")
_EDGE_PUNCT = re.compile(r"^\W*(.*?)\W*$")


@dataclass(frozen=True)
class Profile:
    name: str
    description: str
    keep_roles: frozenset[str] = frozenset()
    hide_categories: frozenset[str] = frozenset()

    def keeps(self, entity: dict) -> bool:
        """Return True if the entity should be shown in this profile."""
        if entity.get("category") in self.hide_categories:
            return False
        return entity.get("role") in self.keep_roles


PROFILES = {
    profile.name: profile
    for profile in (
        Profile(
            "todos",
            "Mascara todas as pessoas (formato do desafio).",
        ),
        Profile(
            "medico",
            "Mostra o profissional que trata ou assina (nome, cédula) e "
            "esconde o titular, familiares e contactos. Os contactos do "
            "profissional continuam mascarados.",
            keep_roles=frozenset({"profissional"}),
            hide_categories=frozenset({"Contacto"}),
        ),
    )
}


def get_profile(name: str) -> Profile:
    try:
        return PROFILES[name]
    except KeyError:
        raise ValueError(
            f"perfil desconhecido: {name!r} (opções: {', '.join(PROFILES)})"
        ) from None


def _bare(word: str) -> str:
    return _EDGE_PUNCT.match(word).group(1).casefold()


def _entity_words(entities: list[dict], wanted) -> set[str]:
    return {
        _bare(word)
        for entity in entities
        if wanted(entity)
        for word in str(entity.get("text", "")).split()
    }


def apply_profile(original_lines: list[str], masked_lines: list[str],
                  entities: list[dict], profile: Profile) -> list[str]:
    """Show again the masked words that belong to entities the profile keeps.

    ``masked_lines`` must be the aligned output (same lines and words as the
    original). A word is restored only if it belongs to a kept entity and to
    no hidden one, so a surname shared with the patient stays masked.
    Entities without a role are never shown.
    """
    if len(original_lines) != len(masked_lines):
        raise ValueError("masked_lines must have one line per original line")
    keep = _entity_words(entities, profile.keeps)
    hide = _entity_words(entities, lambda e: not profile.keeps(e))
    restorable = keep - hide - {""}

    result = []
    for original, masked in zip(original_lines, masked_lines):
        words = original.split()
        parts = _TOKEN_SPLIT.split(masked)
        word_no = 0
        for pos, part in enumerate(parts):
            if not part or part.isspace():
                continue
            if (MASK in part and word_no < len(words)
                    and _bare(words[word_no]) in restorable):
                parts[pos] = words[word_no]
            word_no += 1
        result.append("".join(parts))
    return result
