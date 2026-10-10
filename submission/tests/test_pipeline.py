import json
from functools import partial
from types import SimpleNamespace

import pytest

from anonimizador import llm
from anonimizador.pipeline import anonymize

LINES = [
    "Nome: Maria Santos",
    "Médico: Dr. Carlos Mendes",
    "Diagnóstico: diabetes tipo 2",
]
MASKED = ["Nome: * *", "Médico: Dr. * *", "Diagnóstico: diabetes tipo 2"]


class FakeModels:
    def __init__(self, answers):
        self.answers = list(answers)
        self.temperatures = []

    def generate_content(self, model, contents, config):
        self.temperatures.append(config.temperature)
        return SimpleNamespace(text=self.answers.pop(0))


def answer(lines):
    return json.dumps({"masked_lines": lines, "entities": []})


def run(tmp_path, *answers):
    """Anonymise LINES with the real generate(), cache and validation,
    against a fake model that gives ``answers`` in order."""
    client = SimpleNamespace(models=FakeModels(answers))
    generate_fn = partial(llm.generate, cache_dir=tmp_path, client=client)
    return anonymize(LINES, generate_fn=generate_fn), client.models


def test_empty_json_is_retried_instead_of_leaking(tmp_path):
    result, models = run(tmp_path, "{}", answer(MASKED))
    assert result.lines == MASKED
    assert models.temperatures == [0.0, 0.3]


def test_answer_missing_most_of_the_document_is_retried(tmp_path):
    result, models = run(tmp_path, answer(MASKED[:1]), answer(MASKED))
    assert result.lines == MASKED
    assert models.temperatures == [0.0, 0.3]


def test_merged_lines_are_accepted(tmp_path):
    result, models = run(tmp_path, answer([" ".join(MASKED)]))
    assert result.lines == MASKED
    assert models.temperatures == [0.0]


def test_collapsed_masks_are_accepted(tmp_path):
    # One "*" for a whole name or CSV cell: fewer words, nothing dropped.
    collapsed = ["Nome: *", "Médico: Dr. *", "Diagnóstico: diabetes tipo 2"]
    result, models = run(tmp_path, answer(collapsed))
    assert result.lines == MASKED
    assert models.temperatures == [0.0]


def test_no_output_when_every_answer_is_empty(tmp_path):
    with pytest.raises(llm.InvalidResponseError,
                       match="leaves out 11 of 11 words"):
        run(tmp_path, "{}", "{}", "{}")
    assert not list(tmp_path.glob("*.json"))


def test_invalid_answer_already_in_cache_is_requested_again(tmp_path):
    def must_have_lines(text):
        if not json.loads(text).get("masked_lines"):
            raise ValueError("empty")

    llm.generate("p", cache_dir=tmp_path,
                 client=SimpleNamespace(models=FakeModels(["{}"])))
    models = FakeModels([answer(MASKED)])
    text = llm.generate("p", cache_dir=tmp_path, validate=must_have_lines,
                        client=SimpleNamespace(models=models))
    assert json.loads(text)["masked_lines"] == MASKED
    assert len(models.temperatures) == 1
    # The new answer replaced the bad one, so it is now served from cache.
    again = llm.generate("p", cache_dir=tmp_path, validate=must_have_lines,
                         client=SimpleNamespace(models=FakeModels([])))
    assert again == text
