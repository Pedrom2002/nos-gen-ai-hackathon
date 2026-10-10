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
    assert "identificam uma pessoa" in prompt
    assert '"masked_lines"' in prompt and '"entities"' in prompt


def test_prompt_asks_for_the_role_of_each_entity():
    prompt = build_prompt(LINES)
    assert '"role"' in prompt
    assert all(role in prompt for role in ROLES)


def test_variant_b_also_masks_ages_and_employers():
    a, b = build_prompt(LINES, "A"), build_prompt(LINES, "B")
    assert "idade e local de trabalho" in a
    assert "idade das pessoas e o nome do empregador" not in a
    assert "idade das pessoas e o nome do empregador" in b
    assert "idade e local de trabalho" not in b


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


def test_parse_rejects_json_that_is_not_an_object():
    with pytest.raises(ValueError, match="JSON object"):
        parse_response("[]")


def test_prompt_keeps_clinical_content_and_document_reference():
    prompt = build_prompt(LINES)
    assert "incluindo VIH" in prompt
    assert "data e referência do documento" in prompt
    assert "desde 2018" in prompt


def test_school_rules_are_added_only_to_school_documents():
    school = ["Agrupamento de Escolas de Benfica", "Aluno N.º 12345"]
    assert "CONTEXTO ESCOLAR" in build_prompt(school)
    assert "Aluno N.º" in build_prompt(school)
    assert "CONTEXTO ESCOLAR" not in build_prompt(LINES)


def test_official_prompt_is_unchanged():
    from pathlib import Path

    from anonimizador.extract import extract_lines

    submission = Path(__file__).resolve().parents[1]
    lines = extract_lines(submission.parent / "raw_data"
                          / "document_to_anonymize.pdf")
    committed = (submission / "prompt.txt").read_text(encoding="utf-8")
    assert build_prompt(lines) == committed.replace("\r\n", "\n")
