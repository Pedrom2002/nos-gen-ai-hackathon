from pathlib import Path

from anonimizador.metric import evaluate, is_mask, read_lines

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


def test_a_mask_with_its_punctuation_is_a_masked_word():
    gold = ["Morada: * *, *", "Filhos: 2 (*, 15 anos)"]
    original = ["Morada: Rua Flores, 12", "Filhos: 2 (João, 15 anos)"]
    report = evaluate(gold, gold, original)
    assert report.similarity == report.accuracy == 1.0
    # A bare "*" where the reference keeps the comma is still censored, but
    # it is not the same word, so only Similarity drops.
    bare = evaluate(["Morada: * * *", "Filhos: 2 (*, 15 anos)"], gold,
                    original)
    assert bare.accuracy == 1.0
    assert bare.similarity == 8 / 9
    leak = evaluate(["Morada: * Flores, *", "Filhos: 2 (*, 15 anos)"], gold,
                    original)
    assert leak.missed == [(1, "Flores,")]


def test_gold_file_matches_document_shape():
    gold = read_lines(GOLD_FILE)
    assert len(gold) == 60
    assert sum(is_mask(word) for line in gold for word in line.split()) == 52


def test_gold_file_keeps_the_punctuation_next_to_masks():
    # Same format as submission.txt: "Flores," -> "*,".
    words = [w for line in read_lines(GOLD_FILE) for w in line.split()]
    assert "*," in words and "(*," in words
