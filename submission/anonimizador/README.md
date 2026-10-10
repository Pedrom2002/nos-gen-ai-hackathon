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

## Profiles

The model always masks every person and tags each entity with the role of the person it belongs to (`titular`, `familiar`, `contacto`, `profissional`, `outro`). A profile then decides who is shown again, so the same answer serves different readers:

| Profile | Shows | Use |
|---|---|---|
| `todos` | nobody | challenge output (`submission.txt`) |
| `medico` | the professional who treats or signs (name, licence number) | know who treated the patient without knowing the patient |

A profile only restores masked words, never masks more. A word shared with a hidden person (e.g. a surname) stays masked.

Usage, architecture, results and references will be documented as the project evolves.
