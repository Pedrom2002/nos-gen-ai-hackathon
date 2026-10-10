"""Generate submission.txt and prompt.txt from the challenge PDF.

Usage (from the submission folder):
    python run.py [--pdf FILE] [--model MODEL] [--variant A|B]
                  [--keep-punct] [--redact]

FILE can be a PDF (text or scanned), an image (PNG, JPG, WebP), a DOCX, a
TXT or a CSV; the default is the challenge PDF. --redact also writes the
same file with the masked words removed (<name>_censurado.<ext>), checked
so that they cannot be recovered.

Pipeline: extract the PDF lines, build the prompt, ask Gemini for the
masked document, align its answer with the original word by word, and
write the result. Each run is also logged in data/runs/ for comparison.
"""

import argparse
import json
from datetime import datetime
from pathlib import Path

from anonimizador.llm import DEFAULT_MODEL, generate
from anonimizador.pipeline import anonymize_source
from anonimizador.prompt import VARIANTS
from anonimizador.redact import RedactionError, redact
from anonimizador.report import build_report, to_markdown
from anonimizador.sources import load_source
from anonimizador.verify import check_leaks

SUBMISSION_DIR = Path(__file__).resolve().parent
DEFAULT_PDF = SUBMISSION_DIR.parent / "raw_data" / "document_to_anonymize.pdf"
RUNS_DIR = SUBMISSION_DIR / "data" / "runs"


def run(pdf: Path = DEFAULT_PDF, model: str = DEFAULT_MODEL,
        variant: str = "A", keep_punct: bool = False,
        out_dir: Path = SUBMISSION_DIR, runs_dir: Path = RUNS_DIR,
        generate_fn=generate, redact_file: bool = False) -> dict:
    """Run the whole pipeline and write the output files.

    Returns a summary of the run, which is also saved in ``runs_dir``.
    """
    pdf = Path(pdf)
    source = load_source(pdf.read_bytes(), pdf.suffix)
    result = anonymize_source(source, model, variant, keep_punct,
                              generate_fn)
    # After anonymize_source: OCR text has been fixed by then.
    lines = source.lines
    prompt = result.prompt

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    # Always write LF line endings, as in the repository's .editorconfig.
    (out_dir / "submission.txt").write_text(
        "\n".join(result.lines) + "\n", encoding="utf-8", newline="\n"
    )
    (out_dir / "prompt.txt").write_text(
        prompt, encoding="utf-8", newline="\n"
    )
    report = build_report(lines, result)
    leaks = check_leaks(lines, result.lines, result.masked)
    # The shared report hides the original values (see report.py).
    (out_dir / "report.md").write_text(
        to_markdown(report), encoding="utf-8", newline="\n"
    )

    summary = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "model": model,
        "variant": variant,
        "keep_punct": keep_punct,
        "lines": len(lines),
        "model_lines": result.model_lines,
        "safety_net_masks": len(result.safety_masked),
        "masked_words": [
            {"line": w.line + 1, "index": w.index, "text": w.text}
            for w in result.masked
        ],
        "entities": result.entities,
        "report": report["summary"],
        "leak_check": leaks,
        "uncertain_words": len(source.uncertain),
        "unread_lines": source.unread,
    }
    if redact_file:
        try:
            redacted = redact(source, result.masked, pdf.name, keep_punct)
            (out_dir / redacted.filename).write_bytes(redacted.data)
            summary["redacted"] = redacted.filename
        except RedactionError as error:
            summary["redacted_error"] = str(error)
    runs_dir = Path(runs_dir)
    runs_dir.mkdir(parents=True, exist_ok=True)
    # Microseconds keep two runs in the same second from overwriting.
    stamp = datetime.now().strftime("%Y%m%dT%H%M%S%f")
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
    parser.add_argument("--out-dir", type=Path, default=SUBMISSION_DIR)
    parser.add_argument("--runs-dir", type=Path, default=RUNS_DIR)
    parser.add_argument("--redact", action="store_true",
                        help="also write the file with the words removed")
    args = parser.parse_args(argv)

    summary = run(args.pdf, args.model, args.variant, args.keep_punct,
                  args.out_dir, args.runs_dir, generate_fn=generate,
                  redact_file=args.redact)
    print(f"{summary['lines']} lines, {len(summary['masked_words'])} words "
          f"masked, {len(summary['entities'])} entities explained "
          f"({summary['model']}, variant {summary['variant']})")
    leaks = summary["leak_check"]
    print(f"Leak check: {len(leaks['leaks'])} leaks in "
          f"{leaks['checked']} values checked")
    if "redacted" in summary:
        print(f"Redacted file: {summary['redacted']} (verified)")
    elif "redacted_error" in summary:
        print(f"No redacted file: {summary['redacted_error']}")


if __name__ == "__main__":
    main()
