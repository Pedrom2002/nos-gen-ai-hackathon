from pathlib import Path

from anonimizador.context import detect_contexts, plain_text
from anonimizador.extract import read_document

SUBMISSION = Path(__file__).resolve().parents[1]
OFFICIAL_PDF = SUBMISSION.parent / "raw_data" / "document_to_anonymize.pdf"
TEST_DOCS = SUBMISSION / "data" / "test_docs"


def test_school_document_is_detected():
    lines = ["Agrupamento de Escolas de Benfica", "Aluno N.º 12345"]
    assert detect_contexts(lines) == {"escolar"}


def test_accents_and_case_do_not_matter():
    lines = ["ENCARREGADA DE EDUCAÇÃO: Ana", "Ano Letivo 2025/2026"]
    assert detect_contexts(lines) == {"escolar"}


def test_a_single_school_word_is_not_enough():
    lines = ["Professora universitária na Faculdade de Direito",
             "Seguro escolar incluído"]
    assert detect_contexts(lines) == set()


def test_official_document_has_no_context():
    assert detect_contexts(read_document(OFFICIAL_PDF)) == set()


def test_only_the_school_test_document_is_escolar():
    escolar = {
        path.name for path in TEST_DOCS.iterdir()
        if path.suffix in {".txt", ".pdf", ".csv"}
        and "escolar" in detect_contexts(read_document(path))
    }
    assert escolar == {"08_ficha_aluno.txt"}


def test_plain_text_drops_accents_and_styling():
    assert plain_text("Matrícula N.º") == "matricula n.o"
    assert plain_text("\U0001D400luno") == "aluno"  # math bold A


def test_csv_rows_are_a_table_and_prose_is_not():
    assert detect_contexts(["nome , nif", "Ana , 123", "Rui , 456"]) == {
        "tabela"}
    assert detect_contexts(["Nome: Ana, 30 anos",
                            "Mora em Lisboa, perto do rio"]) == set()
    lines = read_document(TEST_DOCS / "R10_registos_clientes.csv")
    assert detect_contexts(lines) == {"tabela"}
