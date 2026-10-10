import pytest

from anonimizador.profiles import PROFILES, apply_profile, get_profile

ORIGINAL = [
    "Nome: Maria Santos",
    "Nome: António Santos (irmão)",
    "Dr. Carlos Mendes",
    "CRM: 12345-PT",
    "Email: carlos.mendes@centromedicalisboa.pt",
]
MASKED = [
    "Nome: * *",
    "Nome: * * (irmão)",
    "Dr. * *",
    "CRM: *",
    "Email: *",
]
ENTITIES = [
    {"text": "Maria Santos", "category": "Pessoa", "role": "titular"},
    {"text": "António Santos", "category": "Pessoa", "role": "contacto"},
    {"text": "Carlos Mendes", "category": "Pessoa", "role": "profissional"},
    {"text": "12345-PT", "category": "Identificação",
     "role": "profissional"},
    {"text": "carlos.mendes@centromedicalisboa.pt", "category": "Contacto",
     "role": "profissional"},
]


def test_todos_keeps_the_challenge_output():
    lines = apply_profile(ORIGINAL, MASKED, ENTITIES, PROFILES["todos"])
    assert lines == MASKED


def test_medico_shows_the_doctor_and_hides_the_patient():
    lines = apply_profile(ORIGINAL, MASKED, ENTITIES, get_profile("medico"))
    assert lines == [
        "Nome: * *",
        "Nome: * * (irmão)",
        "Dr. Carlos Mendes",
        "CRM: 12345-PT",
        "Email: *",
    ]


def test_word_shared_with_a_hidden_person_stays_masked():
    original = ["Médica: Ana Santos", "Doente: Maria Santos"]
    masked = ["Médica: * *", "Doente: * *"]
    entities = [
        {"text": "Ana Santos", "category": "Pessoa", "role": "profissional"},
        {"text": "Maria Santos", "category": "Pessoa", "role": "titular"},
    ]
    lines = apply_profile(original, masked, entities, PROFILES["medico"])
    assert lines == ["Médica: Ana *", "Doente: * *"]


def test_entity_without_role_is_never_shown():
    entities = [{"text": "Carlos Mendes", "category": "Pessoa"}]
    lines = apply_profile(ORIGINAL, MASKED, entities, PROFILES["medico"])
    assert lines[2] == "Dr. * *"


def test_masks_with_kept_punctuation_are_restored():
    lines = apply_profile(["Dr. Carlos Mendes,"], ["Dr. * *,"],
                          ENTITIES, PROFILES["medico"])
    assert lines == ["Dr. Carlos Mendes,"]


def test_unaligned_lines_are_rejected():
    with pytest.raises(ValueError):
        apply_profile(ORIGINAL, MASKED[:2], ENTITIES, PROFILES["medico"])


def test_unknown_profile_lists_the_options():
    with pytest.raises(ValueError, match="todos"):
        get_profile("advogado")
