import json

import pytest

import run
from anonimizador.extract import extract_lines
from anonimizador.prompt import build_prompt

pytestmark = pytest.mark.skipif(
    not run.DEFAULT_PDF.exists(), reason="official PDF missing"
)


def fake_generate(prompt, model, json_output):
    """Mask only the patient's name, as a model would."""
    assert json_output
    lines = extract_lines(run.DEFAULT_PDF)
    masked = [
        "Nome: *" if line.startswith("Nome: Maria") else line
        for line in lines
    ]
    entities = [{"text": "Maria Conceição Oliveira Santos",
                 "category": "Pessoa", "article": "4.º",
                 "reason": "Nome da paciente"}]
    return json.dumps({"masked_lines": masked, "entities": entities})


def test_run_writes_submission_prompt_and_log(tmp_path):
    summary = run.run(out_dir=tmp_path, runs_dir=tmp_path / "runs",
                      generate_fn=fake_generate)

    submission = (tmp_path / "submission.txt").read_text(encoding="utf-8")
    original = extract_lines(run.DEFAULT_PDF)
    out_lines = submission.splitlines()
    assert len(out_lines) == len(original)
    assert "Nome: * * * *" in out_lines
    assert out_lines[0] == original[0]

    prompt = (tmp_path / "prompt.txt").read_text(encoding="utf-8")
    assert prompt == build_prompt(original, "A")
    for name in ("submission.txt", "prompt.txt"):
        assert b"\r\n" not in (tmp_path / name).read_bytes()

    logs = list((tmp_path / "runs").glob("*.json"))
    assert len(logs) == 1
    assert summary["lines"] == len(original)
    assert [w["text"] for w in summary["masked_words"]] == [
        "Maria", "Conceição", "Oliveira", "Santos",
    ]
