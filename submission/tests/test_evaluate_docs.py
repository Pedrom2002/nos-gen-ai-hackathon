import json

from anonimizador.evaluate_docs import collect, evaluate_document, to_markdown
from anonimizador.extract import read_document


def fake_generate(prompt, model, json_output, **kwargs):
    """A model that masks the name but forgets the email."""
    return json.dumps({
        "masked_lines": ["Nome: * *", "Email: ana@x.pt", "Data: 2026"],
        "entities": [{"text": "Ana Lima"}],
    })


def write_doc(folder, name="ficha.txt", encoding="utf-16"):
    path = folder / name
    path.write_bytes("Nome: Ana Lima\nEmail: ana@x.pt\n\nData: 2026\n"
                     .encode(encoding))
    return path


def test_read_document_handles_utf16_and_cp1252(tmp_path):
    expected = ["Nome: Ana Lima", "Email: ana@x.pt", "Data: 2026"]
    assert read_document(write_doc(tmp_path, "a.txt", "utf-16")) == expected
    assert read_document(write_doc(tmp_path, "b.txt", "cp1252")) == expected


def test_collect_skips_reference_files_and_unknown_types(tmp_path):
    write_doc(tmp_path)
    (tmp_path / "ficha.gold.txt").write_text("x")
    (tmp_path / "foto.jpg").write_bytes(b"\xff")
    assert [p.name for p in collect([tmp_path])] == ["ficha.txt"]


def test_safety_net_and_reference_answer_are_reported(tmp_path):
    doc = write_doc(tmp_path)
    (tmp_path / "ficha.gold.txt").write_text(
        "Nome: * *\nEmail: *\nData: 2026\n", encoding="utf-8"
    )
    result = evaluate_document(doc, out_dir=tmp_path / "out",
                               generate_fn=fake_generate)
    assert result.error == ""
    assert result.masked == 3
    assert result.caught_by_safety_net == 1
    assert result.similarity == result.accuracy == 1.0
    assert (tmp_path / "out" / "ficha.anonimizado.txt").exists()
    row = "| ficha.txt | 3 | 3 | 1 | 100.0% | 100.0% |"
    assert row in to_markdown([result])


def test_errors_are_reported_instead_of_raised(tmp_path):
    def broken(prompt, model, json_output, **kwargs):
        raise RuntimeError("quota")

    result = evaluate_document(write_doc(tmp_path), out_dir=tmp_path,
                               generate_fn=broken)
    assert result.error.startswith("RuntimeError")
