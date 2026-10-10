from pathlib import Path

import pytest

from anonimizador.extract import clean_lines, extract_lines

OFFICIAL_PDF = (
    Path(__file__).resolve().parents[2]
    / "raw_data"
    / "document_to_anonymize.pdf"
)


def test_clean_lines_strips_trailing_whitespace():
    assert clean_lines("Nome: Ana \nData:\t\n") == ["Nome: Ana", "Data:"]


def test_clean_lines_drops_empty_and_blank_lines():
    assert clean_lines("a\n\n   \n\t\nb\n") == ["a", "b"]


def test_clean_lines_keeps_inner_spacing():
    assert clean_lines("+351 912 345 678 ") == ["+351 912 345 678"]


@pytest.mark.skipif(not OFFICIAL_PDF.exists(), reason="official PDF missing")
def test_official_pdf_matches_challenge_example():
    lines = extract_lines(OFFICIAL_PDF)
    assert lines[:4] == [
        "Relatório de Admissão - Centro Médico Lisboa",
        "Data: 15 de abril de 2025",
        "Referência: ADM-2025-04-15-089",
        "Informações do Paciente:",
    ]


@pytest.mark.skipif(not OFFICIAL_PDF.exists(), reason="official PDF missing")
def test_official_pdf_has_no_empty_or_padded_lines():
    lines = extract_lines(OFFICIAL_PDF)
    assert all(line.strip() for line in lines)
    assert all(line == line.rstrip() for line in lines)
