# Anonimizador

The Python package behind Lethe. The full documentation, with the pipeline, the prompt, the privacy rules and the results, is in [`../PROJECT.md`](../PROJECT.md); this file is a map of the modules.

## Pipeline

`pipeline.py` runs one document: it builds the prompt (`prompt.py`), asks the model (`llm.py`: Gemini, or a local model), aligns the answer with the original word by word (`align.py`), applies the regex safety net (`safety.py`) and returns the masked lines. `run.py` writes the deliverables, and `verify.py` and `report.py` check and explain the result.

## Modules

| Module | What it does |
|---|---|
| `extract.py` | text extraction from PDF documents |
| `sources.py` | reads any supported file (PDF, scanned PDF, image, DOCX, TXT, CSV) into lines, plus where each word is |
| `ocr.py` | local OCR with Tesseract: words, boxes and lines; re-reads lines the page OCR skipped; reads pages in parallel |
| `deskew.py` | straightens a photographed page (perspective, or only the tilt of the text when the page has no border) |
| `ocr_fix.py` | fixes OCR misreads with the model before anonymising a photo or scan |
| `context.py` | detects what kind of document it is (for example school records) to add rules to the prompt |
| `prompt.py` | prompt construction and response parsing |
| `llm.py` | model client (Gemini, or a local model through Ollama or an OpenAI-compatible server) with a disk cache and retries |
| `align.py` | accepts only "word becomes `*`" changes from the model's answer |
| `safety.py` | regex safety net for identifiers the model missed |
| `verify.py` | leak check: no masked value may still be readable in the final text |
| `report.py` | explanatory report: what was masked, why and who found it |
| `review.py` | manual review: the person decides, the model only proposes |
| `profiles.py` | which people stay visible in the output (for example the treating doctor) |
| `redact.py` | removes the masked words from the file itself so they cannot come back |
| `redact_verify.py` | reads a redacted file back on its own, not trusting `redact.py` |
| `pseudonymize.py` | the "Anonymizing Prompts" gateway: placeholders before a question reaches the model |
| `sanitize.py` | removes from a PDF what the text pipeline cannot see (signatures, metadata) |
| `metric.py` | local replica of the challenge metrics (Similarity and Accuracy) |
| `evaluate_docs.py` | runs the pipeline on several documents and summarises the results |

## Signatures and metadata

Signature images, stamps, photos, digital signature fields and PDF metadata never reach the text pipeline, so the model cannot mask them. `sanitize.py` removes them from the PDF. Images are deleted from the file, not covered with a box, and the text is left untouched:

```bash
python -m anonimizador.sanitize input.pdf output.pdf
```

The signature is removed even when a profile keeps the signer's name: the name already says who signed, and the image would only help forge it.

## Profiles

The model always masks every person and tags each entity with the role of the person it belongs to (`titular`, `familiar`, `contacto`, `profissional`, `outro`). A profile then decides who is shown again, so the same answer serves different readers:

| Profile | Shows | Use |
|---|---|---|
| `todos` | nobody | challenge output (`submission.txt`) |
| `medico` | the professional who treats or signs (name, licence number) | know who treated the patient without knowing the patient |

A profile only restores masked words, never masks more. A word shared with a hidden person (for example a surname) stays masked.

## Setup and tests

```bash
cd submission
python -m venv .venv
.venv/Scripts/activate        # Windows (use source .venv/bin/activate on Linux/macOS)
pip install -r requirements.txt
cp .env.example .env           # then set GEMINI_API_KEY, or LLM_PROVIDER=ollama for a local model
python -m pytest               # 225 tests
```
