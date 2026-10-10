# Anonimizador

LLM-based system that finds and masks sensitive data in a document, replacing each sensitive word with `*` while keeping the original formatting and meaning.

Work in progress for the NOS challenge at JunctionX Lisbon 2026.

## Structure

- `anonimizador/`: core pipeline (PDF extraction, prompt, Gemini call, word alignment, safety-net regex, report, local evaluation)
- `api/`: FastAPI backend used by the frontend
- `frontend/`: React review interface
- `data/`: local cache and evaluation files (cache and runs are not committed)
- `docs/`: documentation assets

## Setup

```bash
cd submission
python -m venv .venv
.venv/Scripts/activate        # Windows (use source .venv/bin/activate on Linux/macOS)
pip install -r requirements.txt
cp .env.example .env           # then set GEMINI_API_KEY
```

Usage, architecture, results and references will be documented as the project evolves.
