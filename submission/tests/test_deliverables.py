"""Guards on the files the challenge evaluates.

They fail if submission.txt, prompt.txt or report.md stop matching each
other, the official document or the format rules.
"""

from pathlib import Path

import pytest

from anonimizador.align import mask_token
from anonimizador.extract import extract_lines
from anonimizador.metric import evaluate, read_lines
from anonimizador.prompt import build_prompt

SUBMISSION = Path(__file__).resolve().parents[1]
OFFICIAL_PDF = SUBMISSION.parent / "raw_data" / "document_to_anonymize.pdf"

pytestmark = pytest.mark.skipif(not OFFICIAL_PDF.exists(),
                                reason="official PDF missing")


@pytest.fixture(scope="module")
def original():
    return extract_lines(OFFICIAL_PDF)


def test_prompt_txt_is_the_exact_prompt_for_the_official_document(original):
    prompt = (SUBMISSION / "prompt.txt").read_text(encoding="utf-8")
    assert prompt == build_prompt(original, "A")


def test_submission_keeps_layout_and_only_replaces_words(original):
    raw = (SUBMISSION / "submission.txt").read_bytes()
    assert b"\r\n" not in raw
    lines = raw.decode("utf-8").splitlines()
    assert len(lines) == len(original)
    for before, after in zip(original, lines):
        assert after.strip() and after == after.rstrip()
        words, masked = before.split(), after.split()
        assert len(words) == len(masked)
        # A masked word keeps its punctuation ("Flores," -> "*,").
        assert all(m in (w, mask_token(w, True))
                   for w, m in zip(words, masked))


def test_submission_matches_the_reference_answer():
    # The reference marks each masked word as a bare "*".
    output = [" ".join("*" if "*" in w else w for w in line.split())
              for line in read_lines(SUBMISSION / "submission.txt")]
    report = evaluate(output,
                      read_lines(SUBMISSION / "data" / "gold" / "gold.txt"))
    assert report.missed == [] and report.extra == []


def test_report_does_not_reveal_masked_values():
    report = (SUBMISSION / "report.md").read_text(encoding="utf-8")
    for value in ("Maria", "097865413", "maria.santos@emailpessoal.pt",
                  "4111", "+351"):
        assert value not in report
