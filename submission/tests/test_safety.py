from pathlib import Path

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
