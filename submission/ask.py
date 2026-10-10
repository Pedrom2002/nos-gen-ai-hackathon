"""Ask a question about the document without exposing personal data.

Usage (from the submission folder):
    python ask.py "Que tratamentos faz a paciente?" [--pdf FILE]

The document is anonymised, every masked value becomes a placeholder such
as [PESSOA_1], and only that version reaches the model. The answer is shown
twice: as the model wrote it and with the real values restored.
"""

import argparse
from pathlib import Path

from anonimizador.extract import read_document
from anonimizador.llm import DEFAULT_MODEL
from anonimizador.pipeline import anonymize
from anonimizador.pseudonymize import ask

DEFAULT_PDF = (Path(__file__).resolve().parent.parent / "raw_data"
               / "document_to_anonymize.pdf")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("question")
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args(argv)

    lines = read_document(args.pdf)
    result = anonymize(lines, model=args.model)
    answer = ask(lines, result, args.question, model=args.model)
    print("=== What the model saw ===")
    print(answer["model_saw"])
    print("=== Model answer (placeholders) ===")
    print(answer["model_answer"])
    print("=== Answer for the user (values restored) ===")
    print(answer["answer"])


if __name__ == "__main__":
    main()
