from pathlib import Path

import pytest

from anonimizador.extract import extract_lines
from anonimizador.metric import read_lines
from anonimizador.safety import apply_safety_net, find_identifier_words

SUBMISSION = Path(__file__).resolve().parents[1]
OFFICIAL_PDF = SUBMISSION.parent / "raw_data" / "document_to_anonymize.pdf"


def masked(line):
    return apply_safety_net([line], [line])[0][0]


def test_masks_emails_phones_and_ip():
    assert masked("Email: ana@x.pt") == "Email: *"
    assert masked("Tel: +351 912 345 678") == "Tel: * * * *"
    assert masked("Fixo: 214 402 871") == "Fixo: * * *"
    assert masked("IP: 85.240.117.36") == "IP: *"


def test_masks_cartao_cidadao_in_both_formats():
    assert masked("CC 12345678-9ZX0") == "CC *"
    assert masked("CC 11384572 9 ZX3, válido") == "CC * * * válido"


def test_iban_split_across_lines_is_masked_on_both():
    original = ["IBAN PT50 0018 0003 4521", "9870 0201 8. Cartão"]
    output = ["IBAN * * * *", "9870 0201 8. Cartão"]
    lines, added = apply_safety_net(original, output)
    assert lines == ["IBAN * * * *", "* * * Cartão"]
    assert [w.text for w in added] == ["9870", "0201", "8."]


def test_styled_and_struck_through_identifiers_are_found():
    assert masked("Tel 𝟵𝟭𝟮 𝟯𝟰𝟱 𝟲𝟳𝟴") == "Tel * * *"
    struck = "+̶3̶5̶1̶ ̶9̶1̶9̶ ̶4̶4̶2̶ ̶6̶3̶0̶"
    assert "*" in masked(f"Antigo {struck}")


def test_iban_with_space_after_country_code_is_masked():
    assert masked("IBAN: PT 50 0018 0003 4521 9870 0201 8") == (
        "IBAN: * * * * * * * *"
    )


@pytest.mark.parametrize("iban", [
    "DE89 3704 0044 0532 0130 00",
    "GB29 NWBK 6016 1331 9268 19",
    "FR14 2004 1010 0505 0001 3M02 606",
    "ES91 2100 0418 4502 0005 1332",
    "BE68 5390 0754 7034",
    "NO93 8601 1117 947",
    "NL91ABNA0417164300",
    "BR18 0036 0305 0000 1000 9795 493C 1",
])
def test_iban_from_any_country_is_masked(iban):
    words = len(iban.split())
    assert masked(f"Conta {iban} ativa") == "Conta " + "* " * words + "ativa"


def test_code_outside_the_iban_registry_is_not_an_iban():
    line = "Conta ZZ12 3456 7890 1234 5678 ativa"
    assert masked(line) == line


def test_known_country_with_wrong_checksum_is_still_masked():
    assert masked("IBAN ES00 1234 5678 9012 3456 7890") == (
        "IBAN * * * * * *"
    )


def test_iban_from_another_country_split_across_lines():
    original = ["IBAN DE89 3704 0044", "0532 0130 00. Obrigado"]
    lines, _ = apply_safety_net(original, original)
    assert lines == ["IBAN * * *", "* * * Obrigado"]


def test_iban_stops_at_the_country_length():
    line = "PT50 0018 0003 4521 9870 0201 8 2025 ABCD"
    assert masked(line) == "* * * * * * * 2025 ABCD"


def test_codes_that_look_like_ibans_are_kept():
    for line in ["FACE-ID-78901", "CRM: 12345-PT", "ID-BIO-12345",
                 "NIF PT 123456789", "Cartão PT 50 euros por mês"]:
        assert masked(line) == line


def test_landlines_with_label_or_prefix_are_fully_masked():
    assert masked("Tel: 213456789") == "Tel: *"
    assert masked("Fixo +351 213 456 789") == "Fixo * * * *"


def test_numbers_that_only_look_like_phones_or_ips_are_kept():
    for line in ["Fatura 925035027", "Total 1.250.000.000 euros",
                 "Versão 2.10.3.1", "Contrato 213456789"]:
        assert masked(line) == line


def test_ip_after_label_is_masked_but_label_is_kept():
    assert masked("Endereço IP no registo: 85.240.117.36") == (
        "Endereço IP no registo: *"
    )


SCHOOL_HEADER = "Agrupamento de Escolas de Benfica - Ano letivo 2025/2026"


def masked_in_school(line):
    """Mask ``line`` inside a school document (the header sets the
    context)."""
    lines = [SCHOOL_HEADER, line]
    return apply_safety_net(lines, lines)[0][1]


@pytest.mark.parametrize("line, expected", [
    ("Aluno N.º 12345, Turma 9.ºB", "Aluno N.º * Turma 9.ºB"),
    ("Aluno nº12346", "Aluno *"),
    ("N.º de aluno: a2021145", "N.º de aluno: *"),
    ("Número de estudante 2021 0457 (inscrito)",
     "Número de estudante * * (inscrito)"),
    ("Student ID: up201904512", "Student ID: *"),
    ("Matrícula: 2021045", "Matrícula: *"),
    ("Processo n.º P-2291/25", "Processo n.º *"),
    ("Cartão de estudante n.º CE-55120", "Cartão de estudante n.º *"),
    ("N.º: 7781", "N.º: *"),
    ("ID: AB-2291", "ID: *"),
])
def test_school_ids_are_masked_after_their_label(line, expected):
    assert masked_in_school(line) == expected


@pytest.mark.parametrize("line", [
    "Matrícula 2025/2026 confirmada",
    "Matrícula efetuada em setembro",
    "O aluno tem 15 anos e 2 irmãos.",
    "Nota final: 17 valores; Turma 9.ºB; sala n.º 12",
])
def test_school_years_ages_grades_and_rooms_are_kept(line):
    assert masked_in_school(line) == line


def test_context_labels_are_kept_outside_school_documents():
    for line in ["Matrícula: 12-AB-34", "Processo n.º 1234/25.0T8LSB",
                 "N.º: 7781"]:
        assert masked(line) == line


def test_employee_student_and_sns_numbers_are_masked_anywhere():
    assert masked("N.º mecanográfico: 0871") == "N.º mecanográfico: *"
    assert masked("Nº Mec.: 0871") == "Nº Mec.: *"
    assert masked("Aluno N.º 12345") == "Aluno N.º *"
    assert masked("N.º de utente do SNS: 287 449 130") == (
        "N.º de utente do SNS: * * *"
    )


def test_school_test_document_ids():
    lines = (SUBMISSION / "data" / "test_docs"
             / "08_ficha_aluno.txt").read_text(encoding="utf-8").splitlines()
    out = dict(zip(lines, apply_safety_net(lines, lines)[0]))
    assert out["Aluno N.º 20714, Turma 9.º B"] == "Aluno N.º * Turma 9.º B"
    assert out["N.º de processo: P-2291/19"] == "N.º de processo: *"
    assert out["Matrícula: 2019-0457"] == "Matrícula: *"
    assert out["N.º mecanográfico do diretor de turma: 0193"] == (
        "N.º mecanográfico do diretor de turma: *"
    )
    sala = "Observações: o aluno participa no clube de robótica (sala n.º 12)."
    assert out[sala] == sala


def test_keeps_dates_amounts_and_references():
    for line in ["Data: 15 de abril de 2025", "Referência: ADM-2025-04-15-089",
                 "Fatura 225035027", "Renda 950,00 € em 2026"]:
        assert masked(line) == line


def test_already_masked_words_are_not_counted_again():
    _, added = apply_safety_net(["Email: ana@x.pt"], ["Email: *"])
    assert added == []


def test_official_document_matches_only_words_masked_in_the_reference():
    original = extract_lines(OFFICIAL_PDF)
    gold = read_lines(SUBMISSION / "data" / "gold" / "gold.txt")
    for line_no, index in find_identifier_words(original):
        assert gold[line_no].split()[index] == "*"


def test_acronym_after_the_label_is_not_taken_as_the_id():
    assert masked("N.º utente SNS .... 319 048 266") == (
        "N.º utente SNS .... * * *"
    )
