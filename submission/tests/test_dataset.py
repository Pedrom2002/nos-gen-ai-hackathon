"""The generated test set (data/test_docs/generated) and its generator."""

import importlib.util
import random
import sys
from pathlib import Path

import pytest

from anonimizador.context import detect_contexts
from anonimizador.evaluate_docs import collect
from anonimizador.extract import read_document
from anonimizador.metric import evaluate, is_mask, read_lines

SUBMISSION = Path(__file__).resolve().parents[1]
GENERATED = SUBMISSION / "data" / "test_docs" / "generated"

_spec = importlib.util.spec_from_file_location(
    "make_dataset", SUBMISSION / "data" / "test_docs" / "make_dataset.py")
make_dataset = importlib.util.module_from_spec(_spec)
sys.modules["make_dataset"] = make_dataset  # dataclasses look the module up
_spec.loader.exec_module(make_dataset)


# Values from the hand-written documents, which pass the official checks.
@pytest.mark.parametrize("value", ["322018056", "366 283 600", "121458423"])
def test_valid_nif_accepts_real_checksums(value):
    assert make_dataset.valid_nif(value)
    wrong = value[:-1] + str((int(value[-1]) + 1) % 10)
    assert not make_dataset.valid_nif(wrong)


def test_valid_niss_cc_iban_and_card():
    assert make_dataset.valid_niss("16957931864")
    assert make_dataset.valid_niss("12448452633")
    assert not make_dataset.valid_niss("16957931865")
    assert make_dataset.valid_cc("92984162 2 VW8")
    assert make_dataset.valid_cc("79432627-0M36")
    assert make_dataset.valid_cc("158813998P86")
    assert not make_dataset.valid_cc("92984162 3 VW8")
    assert make_dataset.valid_iban("PT50 0018 3215 7116 4941 5772 4")
    assert make_dataset.valid_iban("PT50003566882811265844095")
    assert not make_dataset.valid_iban("PT50 0018 3215 7116 4941 5772 5")
    assert make_dataset.valid_nib("0018 3215 7116 4941 5772 4")
    assert make_dataset.valid_card("4111 1111 1111 1111")
    assert not make_dataset.valid_card("4111 1111 1111 1112")


def test_generated_identifiers_pass_the_checksums():
    rng = random.Random(7)
    for _ in range(300):
        assert make_dataset.valid_nif(make_dataset.make_nif(rng))
        assert make_dataset.valid_niss(make_dataset.make_niss(rng))
        assert make_dataset.valid_cc(make_dataset.make_cc(rng))
        iban = make_dataset.make_iban(rng)
        assert iban.startswith("PT50") and make_dataset.valid_iban(iban)
        assert make_dataset.valid_card(make_dataset.make_card(rng))


def test_gold_line_masks_marked_words_and_keeps_punctuation():
    S = make_dataset.S
    line = f"Nome: {S('Ana Lima')}, filha de {S('Rui')} ({S('pai')}), 30 anos."
    assert make_dataset.gold_line(line) == (
        "Nome: * *, filha de * (*), 30 anos.")
    assert make_dataset.gold_line(f"IBAN {S('PT50 0018 0003')}") == (
        "IBAN * * *")
    assert make_dataset.gold_line("Data: 2026") == "Data: 2026"


def test_check_markers_rejects_unbalanced_or_detached_markers():
    O, C = make_dataset.OPEN, make_dataset.CLOSE
    make_dataset.check_markers([f"a {O}b c{C} d"])
    for bad in [f"{O}a", f"a{C}", f"{O} a{C}", f"{O}a {C}", f"{O}{C}",
                f"{O}a {O}b{C}{C}"]:
        with pytest.raises(AssertionError):
            make_dataset.check_markers([bad])


def documents():
    return collect([GENERATED])


def test_the_set_is_large_and_mixed():
    docs = documents()
    suffixes = {p.suffix for p in docs}
    assert len(docs) >= 80
    assert suffixes == {".txt", ".pdf", ".csv"}
    assert sum(p.suffix == ".csv" for p in docs) >= 15
    assert all(p.with_name(f"{p.stem}.gold.txt").exists() for p in docs)


@pytest.mark.parametrize("path", documents(), ids=lambda p: p.name)
def test_gold_lines_up_with_the_document(path):
    lines = read_document(path)
    gold = read_lines(path.with_name(f"{path.stem}.gold.txt"))
    assert len(gold) == len(lines)
    for original, reference in zip(lines, gold):
        assert len(original.split()) == len(reference.split())
        for word, ref in zip(original.split(), reference.split()):
            assert is_mask(ref) or word == ref
    masked = sum(is_mask(w) for line in gold for w in line.split())
    assert masked >= 5, "every document has something to mask"
    # Masking the gold itself is a perfect answer.
    report = evaluate(gold, gold, lines)
    assert report.similarity == report.accuracy == 1.0


def test_committed_files_are_what_the_generator_writes(tmp_path):
    paths = make_dataset.build(tmp_path)
    assert [p.name for p in paths] == [p.name for p in documents()]
    for fresh in tmp_path.iterdir():
        committed = GENERATED / fresh.name
        assert committed.read_bytes() == fresh.read_bytes(), fresh.name


def test_contexts_of_the_generated_documents():
    escolar = {p.name for p in documents()
               if "escolar" in detect_contexts(read_document(p))}
    assert {"G12_ficha_aluno.txt", "G39_ficha_aluno.txt",
            "G61_ficha_aluno.pdf"} <= escolar
    assert not any("cliente" in name or "fatura" in name for name in escolar)
    for path in documents():
        if path.suffix == ".csv":
            assert "tabela" in detect_contexts(read_document(path)), path.name
