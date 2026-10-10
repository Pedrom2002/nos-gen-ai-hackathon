# Anonimizador

LLM-based system that finds and masks sensitive data in a document, replacing each sensitive word with `*` while keeping the original formatting and meaning.

Work in progress for the NOS challenge at JunctionX Lisbon 2026.

## Structure

- `anonimizador/`: core pipeline (PDF extraction, prompt, Gemini call, word alignment, safety-net regex, report, local evaluation)
- `api/`: FastAPI backend used by the frontend
- `frontend/`: React review interface
- `data/`: local cache and evaluation files (cache and runs are not committed)
- `docs/`: documentation assets

## Signatures and metadata

Signature images, stamps, photos, digital signature fields and PDF metadata never reach the text pipeline, so the model cannot mask them. `sanitize.py` removes them from the PDF. Images are deleted from the file, not covered with a box, and the text is left untouched:

```bash
python -m anonimizador.sanitize input.pdf output.pdf
```

The signature is removed even when a profile keeps the signer's name: the name already says who signed, and the image would only help forge it.

## Setup

```bash
cd submission
python -m venv .venv
.venv/Scripts/activate        # Windows (use source .venv/bin/activate on Linux/macOS)
pip install -r requirements.txt
cp .env.example .env           # then set GEMINI_API_KEY
```

Usage, architecture, results and references will be documented as the project evolves.
