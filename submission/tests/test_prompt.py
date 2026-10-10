import json

import pytest

from anonimizador.prompt import ROLES, build_prompt, parse_response

LINES = ["Relatório - Clínica", "Nome: Ana Correia"]


def test_prompt_contains_numbered_document_and_line_count():
    prompt = build_prompt(LINES)
    assert "DOCUMENTO (2 linhas):" in prompt
    assert "L1: Relatório - Clínica" in prompt
    assert prompt.rstrip().endswith("L2: Nome: Ana Correia")


def test_prompt_states_key_rules():
    prompt = build_prompt(LINES)
    assert "exatamente um asterisco" in prompt
    assert "art. 9.º" in prompt
    assert '"masked_lines"' in prompt and '"entities"' in prompt


def test_prompt_asks_for_the_role_of_each_entity():
    prompt = build_prompt(LINES)
    assert '"role"' in prompt
    assert all(role in prompt for role in ROLES)


def test_variant_b_also_masks_diagnoses():
    assert "diagnósticos" not in build_prompt(LINES, "A")
    assert "diagnósticos" in build_prompt(LINES, "B")


def test_unknown_variant_is_rejected():
    with pytest.raises(ValueError):
        build_prompt(LINES, "C")


def test_parse_plain_json():
    text = json.dumps({
        "masked_lines": ["Relatório - Clínica", "Nome: * *"],
        "entities": [{"text": "Ana Correia", "category": "Pessoa"}],
    })
    lines, entities = parse_response(text)
    assert lines == ["Relatório - Clínica", "Nome: * *"]
    assert entities[0]["text"] == "Ana Correia"


def test_parse_tolerates_fences_and_line_prefixes():
    text = '```json\n{"masked_lines": ["L2: Nome: * *"]}\n```'
    lines, entities = parse_response(text)
    assert lines == ["Nome: * *"]
    assert entities == []


def test_parse_rejects_non_json():
    with pytest.raises(json.JSONDecodeError):
        parse_response("Nome: * *")
