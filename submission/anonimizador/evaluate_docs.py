"""Run the pipeline on several documents and summarise the results.

Usage (from the submission folder):
    python -m anonimizador.evaluate_docs <file or folder>... [--model M]

For each document it reports how many words were masked, how many
identifiers the model missed and the regex safety net caught, and errors.
If a reference answer ``<name>.gold.txt`` sits next to a document, the local
Similarity and Accuracy are reported too. Outputs are written to
data/runs/docs/ so they can be reviewed by hand.
"""

import argparse
import time
from dataclasses import dataclass
from pathlib import Path

from anonimizador.extract import read_document
from anonimizador.llm import DEFAULT_MODEL, generate
from anonimizador.metric import evaluate, read_lines
from anonimizador.pipeline import anonymize

SUPPORTED = {".pdf", ".txt", ".csv"}
OUT_DIR = Path(__file__).resolve().parents[1] / "data" / "runs" / "docs"


@dataclass
class DocResult:
    name: str
    lines: int = 0
    masked: int = 0
    caught_by_safety_net: int = 0
    seconds: float = 0.0
    similarity: float | None = None
    accuracy: float | None = None
    error: str = ""


def collect(paths: list[Path]) -> list[Path]:
    """Expand folders into supported documents, skipping reference files."""
    docs = []
    for path in paths:
        candidates = sorted(path.iterdir()) if path.is_dir() else [path]
        docs += [
            p for p in candidates
            if p.suffix.lower() in SUPPORTED
            and not p.name.endswith(".gold.txt")
        ]
    return docs


def evaluate_document(path: Path, model: str = DEFAULT_MODEL,
                      out_dir: Path = OUT_DIR,
                      generate_fn=generate) -> DocResult:
    result = DocResult(name=path.name)
    start = time.time()
    try:
        lines = read_document(path)
        output = anonymize(lines, model=model, generate_fn=generate_fn)
    except Exception as exc:
        result.error = f"{type(exc).__name__}: {str(exc)[:80]}"
        return result
    result.seconds = time.time() - start
    result.lines = len(lines)
    result.masked = len(output.masked)
    result.caught_by_safety_net = len(output.safety_masked)

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{path.stem}.anonimizado.txt").write_text(
        "\n".join(output.lines) + "\n", encoding="utf-8", newline="\n"
    )
    gold = path.with_name(f"{path.stem}.gold.txt")
    if gold.exists():
        report = evaluate(output.lines, read_lines(gold), lines)
        result.similarity, result.accuracy = report.similarity, report.accuracy
    return result


def to_markdown(results: list[DocResult]) -> str:
    rows = [
        "| Document | Lines | Masked | Caught by safety net | Similarity "
        "| Accuracy | Time | Error |",
        "|---|---|---|---|---|---|---|---|",
    ]

    def pct(value):
        return "" if value is None else f"{value:.1%}"

    for r in results:
        rows.append(
            f"| {r.name} | {r.lines} | {r.masked} | {r.caught_by_safety_net} "
            f"| {pct(r.similarity)} | {pct(r.accuracy)} | {r.seconds:.0f}s "
            f"| {r.error} |"
        )
    return "\n".join(rows)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="+", type=Path)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args(argv)
    results = [evaluate_document(p, args.model) for p in collect(args.paths)]
    print(to_markdown(results))
    print(f"\nOutputs in {OUT_DIR}")


if __name__ == "__main__":
    main()
