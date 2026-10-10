import json
from pathlib import Path

import pytest

import ask
import run
from anonimizador import evaluate_docs, metric

SUBMISSION = Path(__file__).resolve().parents[1]
GOLD = SUBMISSION / "data" / "gold" / "gold.txt"

pytestmark = pytest.mark.skipif(not run.DEFAULT_PDF.exists(),
                                reason="official PDF missing")


def fake_generate(prompt, model, json_output=False, **kwargs):
    """Answer with the reference masks, or a short gateway reply."""
    if json_output:
        lines = metric.read_lines(GOLD)
        return json.dumps({"masked_lines": lines, "entities": []})
    # Without entity categories every placeholder is [DADO_n].
    return "A paciente [DADO_1] tem contactos de emergência."


@pytest.fixture
def fake_model(monkeypatch):
    for module in (run, ask, evaluate_docs):
        monkeypatch.setattr(module, "generate", fake_generate)


def test_run_cli_writes_outputs_and_reports_no_leaks(tmp_path, fake_model,
                                                     capsys):
    run.main(["--out-dir", str(tmp_path), "--runs-dir",
              str(tmp_path / "runs")])
    out = capsys.readouterr().out
    assert "60 lines, 46 words masked" in out
    assert "Leak check: 0 leaks" in out
    for name in ("submission.txt", "prompt.txt", "report.md"):
        assert (tmp_path / name).exists()


def test_ask_cli_shows_both_answers(fake_model, capsys):
    ask.main(["Quem é a paciente?"])
    out = capsys.readouterr().out
    model_part, user_part = out.split("=== Answer for the user")
    assert "Maria Conceição Oliveira Santos" not in model_part
    assert "A paciente Maria Conceição Oliveira Santos tem" in user_part


def test_evaluate_docs_cli_prints_a_table(tmp_path, fake_model, capsys):
    evaluate_docs.main([str(run.DEFAULT_PDF), "--out-dir", str(tmp_path)])
    out = capsys.readouterr().out
    assert "| document_to_anonymize.pdf | 60 | 46 |" in out


def test_metric_report_text():
    gold = metric.read_lines(GOLD)
    text = metric.format_report(metric.evaluate(gold, gold))
    assert "Similarity: 100.00%" in text and "Accuracy:   100.00%" in text
