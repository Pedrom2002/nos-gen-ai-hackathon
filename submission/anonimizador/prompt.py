"""Prompt construction and response parsing.

The prompt combines several techniques: a role (data protection officer),
an explicit taxonomy based on the GDPR, rules for what to keep, strict
formatting rules (one asterisk per word), a short worked example that is
not taken from the evaluated document, a self-check list and a structured
JSON output that also explains every decision.
"""

import json
import re

VARIANTS = ("A", "B")

_ROLE = """\
És um encarregado de proteção de dados (DPO) especializado no RGPD e em \
documentos portugueses. A tua tarefa é anonimizar o documento abaixo: \
substituir por asteriscos todas as palavras que identificam uma pessoa \
ou revelam dados sensíveis sobre ela, sem alterar mais nada."""

_MASK_ALWAYS = """\
MASCARAR (dados pessoais, art. 4.º RGPD):
- Nomes de pessoas: titular, familiares, contactos, profissionais de saúde \
(também nomes próprios isolados, como "João").
- Datas de nascimento e idades de pessoas.
- Identificadores: NIF, Cartão de Cidadão, NISS, n.º de utente, apólices, \
números de cédula ou registo profissional, IDs biométricos.
- Morada completa: rua, número, andar, localidade.
- Telefones e emails (incluindo os de profissionais).
- Dados financeiros: números de cartão, validade, CVV, IBAN, rendimentos.
- Sexo, estado civil e o local de trabalho ou estudo (empregador, escola).

MASCARAR (categorias especiais, art. 9.º RGPD), mesmo em texto corrido:
- Origem racial ou étnica (ex.: "caucasiana").
- Estado serológico ou doenças estigmatizantes (ex.: "HIV positivo").
- Dados genéticos (ex.: mutações como "BRCA1").
- Religião e convicções.
- Dependências e consumos de substâncias.
- Medicação ou tratamento que revela uma condição mascarada (ex.: \
"antirretrovirais" revela VIH).
- Anos ou datas ligados a uma condição sensível (ex.: "desde 2018" num \
diagnóstico de VIH)."""

_MASK_VARIANT_B = """\
- Também todos os diagnósticos e doenças da pessoa referidos em texto \
corrido (ex.: "hipertensão", "diabetes")."""

_KEEP = """\
MANTER (não mascarar):
- Etiquetas de campos e títulos ("Nome:", "Telefone:", "Histórico Médico:").
- Título do documento, nome da instituição, data e referência do documento.
- Palavras de relação ("irmão", "amiga próxima", "mãe").
- Conteúdo clínico genérico: exames, medicação comum, medidas, sintomas, \
especialidades, nomes de planos ou produtos.
- A profissão ou função ("Professora universitária"), desde que o \
empregador seja mascarado.
- Durações, frequências e quantidades ("há 5 anos", "2x/dia", "2 filhos").
- Palavras comuns que não identificam ninguém."""

_KEEP_VARIANT_B = """\
- Exames, medicação e medidas continuam a manter-se."""

_FORMAT = """\
REGRAS DE FORMATO:
1. Cada palavra mascarada passa a exatamente um asterisco "*". Uma palavra \
é tudo o que está entre espaços, incluindo pontuação colada: \
"Flores," passa a "*" e "+351 912 345 678" passa a "* * * *".
2. Não mudes, não corrijas, não traduzas e não reordenes nenhuma outra \
palavra. Mantém a mesma ordem e o mesmo número de linhas.
3. Na dúvida sobre um dado que identifica uma pessoa, mascara: um dado \
que escapa é pior do que um asterisco a mais."""

_EXAMPLE = """\
EXEMPLO (documento diferente do teu):
Entrada:
L1: Ficha de Cliente - Clínica Sol
L2: Nome: Rui Costa Lima
L3: Contacto: 916 222 333, rui.lima@mail.pt
L4: O cliente, 52 anos, é budista e diabético.
Saída:
{"masked_lines": [
  "Ficha de Cliente - Clínica Sol",
  "Nome: * * *",
  "Contacto: * * * *",
  "O cliente, * anos, é * e diabético."],
 "entities": [
  {"text": "Rui Costa Lima", "category": "Pessoa", "article": "4.º",
   "reason": "Nome do titular"},
  {"text": "916 222 333,", "category": "Contacto", "article": "4.º",
   "reason": "Telefone pessoal"},
  {"text": "rui.lima@mail.pt", "category": "Contacto", "article": "4.º",
   "reason": "Email pessoal"},
  {"text": "52", "category": "Pessoa", "article": "4.º",
   "reason": "Idade do titular"},
  {"text": "budista", "category": "Saúde e art. 9.º", "article": "9.º",
   "reason": "Convicção religiosa"}]}"""

_CHECKLIST = """\
ANTES DE RESPONDER, verifica:
- Todos os nomes de pessoas, incluindo os que aparecem só uma vez?
- Todos os números que identificam alguém (telefones, IDs, cartões)?
- Nenhuma etiqueta de campo nem palavra comum foi mascarada?
- O número de linhas é igual ao da entrada?"""

_OUTPUT = """\
FORMATO DA RESPOSTA: apenas um objeto JSON, sem texto à volta, com:
- "masked_lines": lista com cada linha do documento já anonimizada, pela \
mesma ordem e sem o prefixo "Ln:".
- "entities": lista com cada dado mascarado: "text" (texto original), \
"category" (Identificação, Pessoa, Contacto, Saúde e art. 9.º, \
Financeiro, Biométrico), "article" ("4.º" ou "9.º") e "reason" (frase \
curta)."""


def build_prompt(lines: list[str], variant: str = "A") -> str:
    """Return the full prompt for a document given as a list of lines."""
    if variant not in VARIANTS:
        raise ValueError(f"variant must be one of {VARIANTS}")
    mask = _MASK_ALWAYS
    keep = _KEEP
    if variant == "B":
        mask = f"{mask}\n{_MASK_VARIANT_B}"
        keep = f"{keep}\n{_KEEP_VARIANT_B}"
    document = "\n".join(
        f"L{number}: {line}" for number, line in enumerate(lines, 1)
    )
    sections = [
        _ROLE, mask, keep, _FORMAT, _EXAMPLE, _CHECKLIST, _OUTPUT,
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
