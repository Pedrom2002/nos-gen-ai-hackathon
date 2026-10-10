from anonimizador.align import MaskedWord, align, mask_token

ORIGINAL = [
    "Nome: Maria Conceição Oliveira Santos",
    "Morada: Rua das Flores, 123, Sacavém",
    "Data: 15 de abril de 2025",
]


def test_unchanged_output_masks_nothing():
    result = align(ORIGINAL, ORIGINAL)
    assert result.lines == ORIGINAL
    assert result.masked == []


def test_one_asterisk_per_masked_word():
    model = ["Nome: * * * *"] + ORIGINAL[1:]
    result = align(ORIGINAL, model)
    assert result.lines[0] == "Nome: * * * *"
    assert result.lines[1:] == ORIGINAL[1:]
    assert [w.text for w in result.masked] == [
        "Maria", "Conceição", "Oliveira", "Santos",
    ]


def test_collapsed_mask_still_covers_every_word():
    model = ["Nome: *"] + ORIGINAL[1:]
    assert align(ORIGINAL, model).lines[0] == "Nome: * * * *"


def test_model_rewording_is_ignored():
    model = ["Name: * * * *", "Morada: Rua das Flores 123 Sacavém",
             "Data: 15/04/2025"]
    result = align(ORIGINAL, model)
    assert result.lines[0] == "Nome: * * * *"
    assert result.lines[1:] == ORIGINAL[1:]


def test_merged_and_missing_lines_keep_original_layout():
    model = ["Nome: * * * * Morada: Rua das Flores, *, *"]
    result = align(ORIGINAL, model)
    assert result.lines == [
        "Nome: * * * *",
        "Morada: Rua das Flores, * *",
        "Data: 15 de abril de 2025",
    ]


def test_partially_masked_word_counts_as_masked():
    original = ["Email: maria.santos@emailpessoal.pt"]
    model = ["Email: maria.***@emailpessoal.pt"]
    assert align(original, model).lines == ["Email: *"]


def test_punctuation_is_dropped_by_default_and_kept_on_request():
    model = ["Nome: * * * *", "Morada: * * *, *, *", ORIGINAL[2]]
    assert align(ORIGINAL, model).lines[1] == "Morada: * * * * *"
    kept = align(ORIGINAL, model, keep_punct=True).lines[1]
    assert kept == "Morada: * * *, *, *"


def test_masked_words_report_their_position():
    model = [ORIGINAL[0], "Morada: Rua das Flores, 123, *", ORIGINAL[2]]
    assert align(ORIGINAL, model).masked == [MaskedWord(1, 5, "Sacavém")]


def test_mask_token_keeps_brackets_and_trailing_punctuation():
    assert mask_token("(João,", keep_punct=True) == "(*,"
    assert mask_token("(João,") == "*"
    assert mask_token(",", keep_punct=True) == "*"
