"""Fix OCR misreads with the model before anonymising a photo or scan.

OCR turns "Financeiras" into "Financelras" and "CVV" into "OVV". The text
already goes to the model, so one more call asks it to fix only reading
errors. The answer is trusted word by word, never as a whole:

- a line is used only if it keeps the same number of words, so every word
  stays tied to its box in the image and the bars still land in place;
- each corrected word must stay close to what OCR read (a typo fix), so the
  model cannot swap in a different name or number;
- anything else keeps the OCR reading.

The final check of a redacted image reads the image itself with OCR again
and looks for every masked value both as fixed here and as OCR first read
it, so a wrong correction does not hide a leak that OCR can still see.
"""

import json
from difflib import SequenceMatcher

from anonimizador.llm import DEFAULT_MODEL, generate

# A fixed word must be at least this similar to the OCR reading.
MIN_SIMILARITY = 0.6

PROMPT = """\
És um revisor de texto lido por OCR a partir de uma fotografia de um \
documento português. Corrige apenas erros de leitura: letras trocadas, \
acentos, maiúsculas, pontuação mal lida e caracteres estranhos dentro de \
números (por exemplo "Financelras" -> "Financeiras", "72Kkg" -> "72kg", \
"123456/89" -> "123456789").

Regras:
1. Mantém exatamente o mesmo número de palavras em cada linha. Uma palavra \
é tudo o que está entre espaços. Nunca juntes, separes, acrescentes nem \
removas palavras.
2. Não reformules nem troques palavras certas, nomes ou números por \
outros. Não corrijas a ortografia do autor nem variantes do português \
(por exemplo, "registrada" fica "registrada"): só erros de leitura.
3. Mantém o mesmo número de linhas, pela mesma ordem.

Responde só com JSON: {{"lines": ["linha 1", "linha 2", ...]}}

Linhas:
{lines}
"""


def build_prompt(lines: list[str]) -> str:
    numbered = "\n".join(f"L{n}: {line}" for n, line in enumerate(lines, 1))
    return PROMPT.format(lines=numbered)


def _parse(text: str, count: int) -> list[str]:
    data = json.loads(text)
    lines = data.get("lines") if isinstance(data, dict) else None
    if not isinstance(lines, list) or len(lines) != count \
            or not all(isinstance(line, str) for line in lines):
        raise ValueError("lines must be a list with one entry per line")
    return lines


def merge(original: str, fixed: str) -> str:
    """Take the model's fixes for one line, word by word, when safe."""
    old, new = original.split(), fixed.split()
    if len(old) != len(new):
        return original
    words = []
    for before, after in zip(old, new):
        close = SequenceMatcher(None, before.casefold(),
                                after.casefold()).ratio()
        words.append(after if close >= MIN_SIMILARITY else before)
    return " ".join(words)


def fix_lines(lines: list[str], model: str = DEFAULT_MODEL,
              generate_fn=generate) -> list[str]:
    """Return the lines with OCR misreads fixed; the original on failure."""
    if not lines:
        return lines
    try:
        answer = generate_fn(
            build_prompt(lines), model=model, json_output=True,
            validate=lambda text: _parse(text, len(lines)))
        fixed = _parse(answer, len(lines))
    except Exception:
        # The anonymisation still runs on what OCR read.
        return lines
    return [merge(old, new) for old, new in zip(lines, fixed)]
