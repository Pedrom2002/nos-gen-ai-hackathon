from types import SimpleNamespace

from anonimizador.align import MaskedWord
from anonimizador.pseudonymize import ask, pseudonymize
from anonimizador.report import build_report, masked_spans, to_markdown
from anonimizador.verify import check_leaks

ORIGINAL = [
    "Nome: Maria Santos, NIF 123456789",
    "A paciente Maria Santos vive em Lisboa.",
    "Email: maria@x.pt",
]


def masked_words(*positions):
    return [MaskedWord(line, index, ORIGINAL[line].split()[index])
            for line, index in positions]


RESULT = SimpleNamespace(
    masked=masked_words((0, 1), (0, 2), (0, 4), (1, 2), (1, 3), (2, 1)),
    safety_masked=masked_words((2, 1)),
    entities=[
        {"text": "Maria Santos", "category": "Pessoa", "role": "titular",
         "reason": "Nome da paciente"},
        {"text": "123456789", "category": "Identificação",
         "role": "titular", "reason": "NIF"},
    ],
)
OUTPUT = ["Nome: * * NIF *", "A paciente * * vive em Lisboa.", "Email: *"]


def test_consecutive_masked_words_form_one_span():
    spans = masked_spans(ORIGINAL, RESULT.masked)
    assert [s.text for s in spans] == [
        "Maria Santos,", "123456789", "Maria Santos", "maria@x.pt",
    ]


def test_report_explains_each_item_and_its_source():
    report = build_report(ORIGINAL, RESULT)
    first, nif, _, email = report["items"]
    assert first["reason"] == "Nome da paciente"
    assert first["category"] == "Pessoa" and first["words"] == 2
    assert nif["reason"] == "NIF"
    assert email["source"] == "rede de segurança"
    assert report["summary"]["masked_words"] == 6
    assert report["summary"]["by_source"] == {"modelo": 3,
                                              "rede de segurança": 1}


def test_markdown_hides_values_unless_asked():
    report = build_report(ORIGINAL, RESULT)
    hidden = to_markdown(report)
    assert "Maria" not in hidden and "123456789" not in hidden
    assert "* * (2 palavras)" in hidden
    assert "Maria Santos" in to_markdown(report, show_values=True)


def test_no_leaks_when_every_value_is_masked():
    leaks = check_leaks(ORIGINAL, OUTPUT, RESULT.masked)
    assert leaks == {"checked": 3, "leaks": []}


def test_leak_found_when_a_name_stays_visible_elsewhere():
    output = ["Nome: * * NIF *", "A paciente Maria Santos vive em Lisboa.",
              "Email: *"]
    masked = masked_words((0, 1), (0, 2), (0, 4), (2, 1))
    leaks = check_leaks(ORIGINAL, output, masked)
    assert leaks["leaks"] == [{"line": 2, "text": "Maria Santos,"}]


def test_single_common_word_visible_elsewhere_is_not_a_leak():
    original = ["Morada: Rua X, Lisboa", "Centro Médico Lisboa"]
    masked = [MaskedWord(0, 3, "Lisboa")]
    output = ["Morada: Rua X, *", "Centro Médico Lisboa"]
    assert check_leaks(original, output, masked)["leaks"] == []


def test_pseudonyms_are_consistent_and_reversible():
    pseudo = pseudonymize(ORIGINAL, RESULT)
    assert pseudo.lines == [
        "Nome: [PESSOA_1], NIF [ID_1]",
        "A paciente [PESSOA_1] vive em Lisboa.",
        "Email: [DADO_1]",
    ]
    assert pseudo.restore("Fale com [PESSOA_1].") == "Fale com Maria Santos."
    assert pseudo.protect("Onde vive Maria Santos?") == "Onde vive [PESSOA_1]?"


def test_gateway_never_sends_real_values_to_the_model():
    seen = {}

    def fake_model(prompt, model):
        seen["prompt"] = prompt
        return "[PESSOA_1] vive em Lisboa."

    answer = ask(ORIGINAL, RESULT, "Onde vive Maria Santos?",
                 generate_fn=fake_model)
    for value in ("Maria", "Santos", "123456789", "maria@x.pt"):
        assert value not in seen["prompt"]
    assert answer["answer"] == "Maria Santos vive em Lisboa."
    assert answer["model_answer"] == "[PESSOA_1] vive em Lisboa."
