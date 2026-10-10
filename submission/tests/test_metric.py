from pathlib import Path

from anonimizador.metric import evaluate, read_lines

GOLD = ["Nome: * *", "Data: 15 de abril"]
ORIGINAL = ["Nome: Ana Correia", "Data: 15 de abril"]
GOLD_FILE = Path(__file__).resolve().parents[1] / "data" / "gold" / "gold.txt"


def test_perfect_output_scores_100():
    report = evaluate(GOLD, GOLD)
    assert report.similarity == report.accuracy == report.score == 1.0
    assert report.missed == report.extra == []


def test_leaked_word_lowers_both_metrics():
    report = evaluate(["Nome: Ana *", "Data: 15 de abril"], GOLD, ORIGINAL)
    assert report.similarity == 6 / 7
    assert report.accuracy == 1 / 2
    assert report.missed == [(1, "Ana")]


def test_extra_mask_lowers_only_similarity():
    report = evaluate(["Nome: * *", "Data: * de abril"], GOLD, ORIGINAL)
    assert report.similarity == 6 / 7
    assert report.accuracy == 1.0
    assert report.extra == [(2, "15")]


def test_missing_words_count_as_wrong():
    report = evaluate(["Nome: * *"], GOLD)
    assert report.similarity == 3 / 7
    assert report.accuracy == 1.0


def test_gold_file_matches_document_shape():
    gold = read_lines(GOLD_FILE)
    assert len(gold) == 60
    assert sum(word == "*" for line in gold for word in line.split()) == 46
