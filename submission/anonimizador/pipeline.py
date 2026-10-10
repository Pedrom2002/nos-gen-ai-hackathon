"""The anonymisation pipeline for one document, shared by run.py and tools.

prompt -> Gemini (JSON) -> word-by-word alignment -> regex safety net.
"""

from dataclasses import dataclass, replace

from anonimizador.align import MaskedWord, _render, align, count_dropped
from anonimizador.llm import DEFAULT_MODEL, InvalidResponseError, generate
from anonimizador.prompt import build_prompt, parse_response
from anonimizador.safety import apply_safety_net

# Temperatures tried in order when the model returns invalid JSON: the first
# is deterministic, the next ones change the answer enough to recover.
RETRY_TEMPERATURES = (0.0, 0.3, 0.6)
# Share of the document's words the answer must account for. Alignment keeps
# the words the model drops, unmasked, so an answer like {} would leak the
# whole document. Dropped words are counted by alignment, so collapsed masks
# ("*" for a whole name or CSV cell) do not count against the answer.
MIN_WORD_COVERAGE = 0.8


@dataclass
class Anonymized:
    prompt: str
    lines: list[str]
    masked: list[MaskedWord]
    safety_masked: list[MaskedWord]
    entities: list[dict]
    model_lines: int


def mask_more(original_lines: list[str], result: Anonymized,
              positions: set[tuple[int, int]],
              keep_punct: bool = False) -> Anonymized:
    """Also mask the given (line, word index) positions.

    Used for OCR words read with low confidence that look like identifiers:
    a misread "@" or digit can hide an email or a number from the model and
    the patterns, so they are masked as a precaution (as the safety net).
    """
    done = {(w.line, w.index) for w in result.masked}
    extra = [MaskedWord(line, index, original_lines[line].split()[index])
             for line, index in sorted(positions) if (line, index) not in done]
    if not extra:
        return result
    masked = sorted(result.masked + extra, key=lambda w: (w.line, w.index))
    per_line: dict[int, set[int]] = {}
    for word in masked:
        per_line.setdefault(word.line, set()).add(word.index)
    lines = [_render(line, per_line.get(n, set()), keep_punct)
             for n, line in enumerate(original_lines)]
    return replace(result, lines=lines, masked=masked,
                   safety_masked=result.safety_masked + extra)


def _word_count(lines: list[str]) -> int:
    return sum(len(line.split()) for line in lines)


def answer_validator(lines: list[str]):
    """Return a check for the model's answer to ``lines``: valid JSON whose
    masked_lines contain most of the document's words."""
    expected = _word_count(lines)

    def validate(text: str) -> None:
        masked_lines, _ = parse_response(text)
        dropped = count_dropped(lines, masked_lines)
        if expected - dropped < MIN_WORD_COVERAGE * expected:
            raise ValueError(
                f"masked_lines leaves out {dropped} of {expected} words"
            )

    return validate


def anonymize(lines: list[str], model: str = DEFAULT_MODEL,
              variant: str = "A", keep_punct: bool = False,
              generate_fn=generate) -> Anonymized:
    """Anonymise a document given as clean lines."""
    prompt = build_prompt(lines, variant)
    validate = answer_validator(lines)
    last_error = None
    for temperature in RETRY_TEMPERATURES:
        try:
            answer = generate_fn(prompt, model=model, json_output=True,
                                 temperature=temperature,
                                 validate=validate)
        except InvalidResponseError as exc:
            last_error = exc
            continue
        masked_lines, entities = parse_response(answer)
        break
    else:
        raise last_error

    result = align(lines, masked_lines, keep_punct=keep_punct)
    final_lines, safety_masked = apply_safety_net(
        lines, result.lines, keep_punct=keep_punct
    )
    return Anonymized(
        prompt=prompt,
        lines=final_lines,
        masked=sorted(result.masked + safety_masked,
                      key=lambda w: (w.line, w.index)),
        safety_masked=safety_masked,
        entities=entities,
        model_lines=len(masked_lines),
    )


def anonymize_source(source, model: str = DEFAULT_MODEL, variant: str = "A",
                     keep_punct: bool = False,
                     generate_fn=generate) -> Anonymized:
    """Anonymise a sources.Source: its lines, plus its uncertain OCR words."""
    result = anonymize(source.lines, model, variant, keep_punct, generate_fn)
    return mask_more(source.lines, result, source.uncertain, keep_punct)
