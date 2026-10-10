"""Prompt construction and response parsing.

Rule (confirmed with the challenge mentors): mask only what identifies a
person. Clinical content, characteristics that do not identify anyone on
their own, and the document's date and reference stay visible.

The prompt combines several techniques: a role (data protection officer),
an explicit list of identifiers, an explicit list of what to keep, a
self-test for doubtful cases, strict formatting rules (one asterisk per
word), a worked example that is not taken from the evaluated document, a
self-check list and a structured JSON output that explains every decision.
Variant B also masks ages and employers, to compare against the score.
"""

import json
import re

VARIANTS = ("A", "B")
ROLES = ("titular", "familiar", "contacto", "profissional", "outro")

_ROLE = """\
És um encarregado de proteção de dados (DPO) especializado no RGPD e em \
documentos portugueses. A tua tarefa é anonimizar o documento abaixo: \
substituir por asteriscos apenas as palavras que identificam uma pessoa \
concreta, deixando todo o resto exatamente igual. O objetivo é que ninguém \
consiga saber quem são as pessoas, mantendo útil o conteúdo do documento."""

_MASK = """\
MASCARAR (identificam uma pessoa):
- Nomes de pessoas: titular, familiares, contactos e profissionais \
(também nomes próprios isolados, como "João").
- Data de nascimento.
- Números de identificação: NIF, Cartão de Cidadão, NISS, n.º de utente, \
apólices, cédula ou registo profissional, IDs biométricos.
- Morada: rua, número, andar, localidade.
- Telefones e emails, incluindo os de profissionais.
- Dados de pagamento: número do cartão, validade, CVV, IBAN."""

_MASK_VARIANT_B = """\
- Também a idade das pessoas e o nome do empregador ou da escola."""

_KEEP = """\
MANTER (não identificam ninguém sozinhos):
- Conteúdo clínico: diagnósticos e doenças (incluindo VIH), exames, \
resultados, medicação, tratamentos, hábitos, dependências, sintomas, medidas.
- Características: sexo, origem étnica, estado civil, religião, profissão, \
rendimento{keep_extra}.
- Etiquetas de campos e títulos ("Nome:", "Telefone:", "Histórico Médico:").
- Título do documento, nome da instituição, data e referência do documento.
- Palavras de relação ("irmão", "amiga próxima", "mãe").
- Anos de acontecimentos, durações, frequências e quantidades \
("desde 2018", "há 5 anos", "2x/dia", "2 filhos")."""

_DOUBT = """\
NA DÚVIDA, pergunta: este dado, sozinho, permite saber quem é a pessoa ou \
contactá-la? Se sim, mascara. Se não, mantém."""

_FORMAT = """\
REGRAS DE FORMATO:
1. Cada palavra mascarada passa a exatamente um asterisco "*". Uma palavra \
é tudo o que está entre espaços, incluindo pontuação colada: \
"Flores," passa a "*" e "+351 912 345 678" passa a "* * * *".
2. Não mudes, não corrijas, não traduzas e não reordenes nenhuma outra \
palavra. Mantém a mesma ordem e o mesmo número de linhas."""

_EXAMPLE = """\
EXEMPLO (documento diferente do teu, com as regras acima):
Entrada:
L1: Ficha de Cliente - Clínica Sol
L2: Nome: Rui Costa Lima
L3: Contacto: 916 222 333, rui.lima@mail.pt
L4: O cliente, 52 anos, é budista e diabético desde 2015.
L5: Médico: Dr. Paulo Reis
Saída:
{"masked_lines": [
  "Ficha de Cliente - Clínica Sol",
  "Nome: * * *",
  "Contacto: * * * *",
  "O cliente, 52 anos, é budista e diabético desde 2015.",
  "Médico: Dr. * *"],
 "entities": [
  {"text": "Rui Costa Lima", "category": "Pessoa", "article": "4.º",
   "role": "titular", "reason": "Nome do titular"},
  {"text": "916 222 333,", "category": "Contacto", "article": "4.º",
   "role": "titular", "reason": "Telefone pessoal"},
  {"text": "rui.lima@mail.pt", "category": "Contacto", "article": "4.º",
   "role": "titular", "reason": "Email pessoal"},
  {"text": "Paulo Reis", "category": "Pessoa", "article": "4.º",
   "role": "profissional", "reason": "Nome do médico"}]}"""

_CHECKLIST = """\
ANTES DE RESPONDER, verifica:
- Todos os nomes de pessoas, incluindo os que aparecem só uma vez?
- Todos os números que identificam alguém (telefones, IDs, cartões)?
- Nenhum diagnóstico, característica, data do documento ou etiqueta foi \
mascarado?
- O número de linhas é igual ao da entrada?"""

_OUTPUT = """\
FORMATO DA RESPOSTA: apenas um objeto JSON, sem texto à volta, com:
- "masked_lines": lista com cada linha do documento já anonimizada, pela \
mesma ordem e sem o prefixo "Ln:".
- "entities": lista com cada dado mascarado: "text" (texto original), \
"category" (Identificação, Pessoa, Contacto, Financeiro, Biométrico), \
"article" ("4.º"), "role" (a quem pertence o dado: titular, familiar, \
contacto, profissional para quem trata, assina ou emite o documento, ou \
outro) e "reason" (frase curta)."""


def build_prompt(lines: list[str], variant: str = "A") -> str:
    """Return the full prompt for a document given as a list of lines."""
    if variant not in VARIANTS:
        raise ValueError(f"variant must be one of {VARIANTS}")
    mask = _MASK
    keep = _KEEP.format(keep_extra=", idade e local de trabalho")
    if variant == "B":
        mask = f"{mask}\n{_MASK_VARIANT_B}"
        keep = _KEEP.format(keep_extra="")
    document = "\n".join(
        f"L{number}: {line}" for number, line in enumerate(lines, 1)
    )
    sections = [
        _ROLE, mask, keep, _DOUBT, _FORMAT, _EXAMPLE, _CHECKLIST, _OUTPUT,
        f"DOCUMENTO ({len(lines)} linhas):\n{document}",
    ]
    return "\n\n".join(sections) + "\n"


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


def parse_response(text: str) -> tuple[list[str], list[dict]]:
    """Read the model's JSON answer into masked lines and entities.

    Code fences are tolerated. A missing "Ln:" prefix is expected, but one
    left by the model is removed.
    """
    data = json.loads(_FENCE.sub("", text.strip()))
    if not isinstance(data, dict):
        raise ValueError("expected a JSON object with masked_lines")
    lines = [
        re.sub(r"^L\d+:\s?", "", str(line))
        for line in data.get("masked_lines", [])
    ]
    entities = [e for e in data.get("entities", []) if isinstance(e, dict)]
    return lines, entities
