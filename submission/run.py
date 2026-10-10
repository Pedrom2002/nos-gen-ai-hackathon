"""Generate submission.txt and prompt.txt from the challenge PDF.

Usage (from the submission folder):
    python run.py [--model MODEL] [--variant A|B] [--keep-punct]

Pipeline: extract the PDF lines, build the prompt, ask Gemini for the
masked document, align its answer with the original word by word, and
write the result. Each run is also logged in data/runs/ for comparison.
"""

import argparse
import json
from datetime import datetime
from pathlib import Path

from anonimizador.align import align
from anonimizador.extract import extract_lines
from anonimizador.llm import DEFAULT_MODEL, generate
from anonimizador.prompt import VARIANTS, build_prompt, parse_response

SUBMISSION_DIR = Path(__file__).resolve().parent
DEFAULT_PDF = SUBMISSION_DIR.parent / "raw_data" / "document_to_anonymize.pdf"
RUNS_DIR = SUBMISSION_DIR / "data" / "runs"


def run(pdf: Path = DEFAULT_PDF, model: str = DEFAULT_MODEL,
        variant: str = "A", keep_punct: bool = False,
        out_dir: Path = SUBMISSION_DIR, runs_dir: Path = RUNS_DIR,
        generate_fn=generate) -> dict:
    """Run the whole pipeline and write the output files.

    Returns a summary of the run, which is also saved in ``runs_dir``.
    """
    lines = extract_lines(pdf)
    prompt = build_prompt(lines, variant)
    answer = generate_fn(prompt, model=model, json_output=True)
    masked_lines, entities = parse_response(answer)
    result = align(lines, masked_lines, keep_punct=keep_punct)

    out_dir = Path(out_dir)
    # Always write LF line endings, as in the repository's .editorconfig.
    (out_dir / "submission.txt").write_text(
        "\n".join(result.lines) + "\n", encoding="utf-8", newline="\n"
    )
    (out_dir / "prompt.txt").write_text(
        prompt, encoding="utf-8", newline="\n"
    )

    summary = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "model": model,
        "variant": variant,
        "keep_punct": keep_punct,
        "lines": len(lines),
        "model_lines": len(masked_lines),
        "masked_words": [
            {"line": w.line + 1, "index": w.index, "text": w.text}
            for w in result.masked
        ],
        "entities": entities,
    }
    runs_dir = Path(runs_dir)
    runs_dir.mkdir(parents=True, exist_ok=True)
    stamp = summary["timestamp"].replace(":", "")
    (runs_dir / f"{stamp}_{variant}.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return summary


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--variant", choices=VARIANTS, default="A")
    parser.add_argument("--keep-punct", action="store_true",
                        help='keep attached punctuation ("Flores," -> "*,")')
    args = parser.parse_args(argv)

    summary = run(args.pdf, args.model, args.variant, args.keep_punct)
    print(f"{summary['lines']} lines, {len(summary['masked_words'])} words "
          f"masked, {len(summary['entities'])} entities explained "
          f"({summary['model']}, variant {summary['variant']})")


if __name__ == "__main__":
    main()
