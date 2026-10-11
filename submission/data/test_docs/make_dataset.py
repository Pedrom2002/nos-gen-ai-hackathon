"""Make the generated test set (data/test_docs/generated) and its answers.

Usage (from the submission folder):
    python data/test_docs/make_dataset.py [OUT_DIR]

Every document is built from a template filled with invented people: names,
addresses, phones, emails and identifiers whose NIF, NISS, Cartão de
Cidadão, IBAN and card numbers pass the official checksums. The generator
knows which words it put there to identify someone, so next to each
document it writes the reference answer ``<name>.gold.txt`` that
``anonimizador.evaluate_docs`` reads: the same lines with each of those
words replaced by ``*`` (the punctuation glued to a word stays, as in
data/gold/gold.txt, so run the evaluation with ``--keep-punct``).

The set is deterministic (fixed seed): running the script again writes the
same files, and tests/test_dataset.py checks that the committed files are
the ones the script produces. Formats: TXT (UTF-8, UTF-8 with BOM, UTF-16,
Windows-1252, LF and CRLF), PDF (one line of text per line of the
document) and CSV (comma, semicolon, tab and pipe; quoted cells with the
delimiter or line breaks inside; several encodings).

What the answers mask follows prompt.txt: names of people in any role
(including first names alone, initials and signatures), dates of birth,
identification numbers (NIF, CC, NISS, SNS, policies, professional and
driving licences, employee and student numbers), addresses, phones,
emails, payment data (IBAN, account, card, validity, CVV), credentials
(usernames, passwords, PINs, security answers, IP addresses, GPS
coordinates), the employer or school of a person and the amount of a
salary. Everything else stays: the institution that issues the document,
its date and references, invoice and order numbers, ages, clinical content,
professions, relations, amounts and quantities.
"""

from __future__ import annotations

import csv
import io
import random
import re
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import pymupdf

SUBMISSION = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SUBMISSION))

from anonimizador.align import mask_token  # noqa: E402
from anonimizador.extract import clean_lines, read_document  # noqa: E402
from anonimizador.tabular import read_csv  # noqa: E402

OUT = Path(__file__).resolve().parent / "generated"
SEED = 2026
# Every sensitive value is wrapped in these markers while the document is
# built; they are removed from the document and turned into "*" in the gold.
OPEN, CLOSE = "⟦", "⟧"


def S(value) -> str:
    """Mark a value as identifying a person."""
    return f"{OPEN}{value}{CLOSE}"


# --------------------------------------------------------------------------
# Checksums of Portuguese identifiers
# --------------------------------------------------------------------------

def _digits(text: str) -> str:
    return re.sub(r"\D", "", text)


def nif_check_digit(first_eight: str) -> int:
    total = sum(int(c) * w for c, w in zip(first_eight, range(9, 1, -1)))
    rest = total % 11
    return 0 if rest < 2 else 11 - rest


def valid_nif(text: str) -> bool:
    d = _digits(text)
    return (len(d) == 9 and d[0] in "1235689"
            and int(d[8]) == nif_check_digit(d[:8]))


NISS_WEIGHTS = (29, 23, 19, 17, 13, 11, 7, 5, 3, 2)


def niss_check_digit(first_ten: str) -> int:
    return 9 - sum(int(c) * w for c, w in zip(first_ten, NISS_WEIGHTS)) % 10


def valid_niss(text: str) -> bool:
    d = _digits(text)
    return len(d) == 11 and d[0] in "12" and int(d[10]) == niss_check_digit(
        d[:10])


def _cc_sum(chars: str) -> int:
    total, double = 0, False
    for ch in reversed(chars):
        value = int(ch) if ch.isdigit() else ord(ch) - 55
        if double:
            value *= 2
            if value > 9:
                value -= 9
        total += value
        double = not double
    return total


def valid_cc(text: str) -> bool:
    """A Cartão de Cidadão number: 8 digits, check digit, then the version
    (two letters or digits and a digit), in any of the usual spacings
    ("12345678 9 ZX0", "12345678-9ZX0", "123456789ZX0")."""
    chars = re.sub(r"[\s-]", "", text)
    return (re.fullmatch(r"\d{9}[A-Z0-9]{2}\d", chars) is not None
            and _cc_sum(chars) % 10 == 0)


def _mod97(digits: str) -> int:
    rest = 0
    for ch in digits:
        rest = (rest * 10 + int(ch)) % 97
    return rest


def valid_iban(text: str) -> bool:
    compact = re.sub(r"\s", "", text).upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", compact):
        return False
    rearranged = compact[4:] + compact[:4]
    numeric = "".join(str(int(c, 36)) for c in rearranged)
    return _mod97(numeric) == 1


def valid_nib(text: str) -> bool:
    d = _digits(text)
    return len(d) == 21 and 98 - _mod97(d[:19] + "00") == int(d[19:])


def luhn_check_digit(digits: str) -> int:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        value = int(ch)
        if i % 2 == 0:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return (10 - total % 10) % 10


def valid_card(text: str) -> bool:
    d = _digits(text)
    return len(d) == 16 and luhn_check_digit(d[:15]) == int(d[15])


# --------------------------------------------------------------------------
# Random values
# --------------------------------------------------------------------------

def rand_digits(rng: random.Random, n: int, first: str = "0123456789") -> str:
    return rng.choice(first) + "".join(rng.choice("0123456789")
                                       for _ in range(n - 1))


def make_nif(rng: random.Random, first: str = "123") -> str:
    eight = rand_digits(rng, 8, first)
    return eight + str(nif_check_digit(eight))


def make_niss(rng: random.Random) -> str:
    ten = rand_digits(rng, 10, "12")
    return ten + str(niss_check_digit(ten))


CC_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"


def make_cc(rng: random.Random) -> str:
    """The compact 12 characters of a valid Cartão de Cidadão number."""
    eight = rand_digits(rng, 8, "123456789")
    tail = rng.choice(CC_LETTERS) + rng.choice(CC_LETTERS) + rng.choice(
        "0123456789")
    for check in range(10):
        chars = f"{eight}{check}{tail}"
        if _cc_sum(chars) % 10 == 0:
            return chars
    raise AssertionError("no check digit fits")  # pragma: no cover


BANKS = [
    ("0007", "Novo Banco"), ("0010", "Banco BPI"), ("0018", "Santander Totta"),
    ("0033", "Millennium bcp"), ("0035", "Caixa Geral de Depósitos"),
    ("0036", "Montepio"), ("0045", "Crédito Agrícola"), ("0079", "EuroBic"),
    ("0023", "ActivoBank"), ("0269", "Bankinter"),
]


def make_nib(rng: random.Random, bank: str | None = None) -> str:
    bank = bank or rng.choice(BANKS)[0]
    nineteen = bank + rand_digits(rng, 4) + rand_digits(rng, 11)
    return nineteen + f"{98 - _mod97(nineteen + '00'):02d}"


def make_iban(rng: random.Random, bank: str | None = None) -> str:
    """A compact Portuguese IBAN (PT50 + NIB)."""
    nib = make_nib(rng, bank)
    numeric = "".join(str(int(c, 36)) for c in nib + "PT00")
    check = 98 - _mod97(numeric)
    return f"PT{check:02d}{nib}"


def make_card(rng: random.Random) -> str:
    fifteen = rand_digits(rng, 15, "45")
    return fifteen + str(luhn_check_digit(fifteen))


def group4(digits: str) -> str:
    return " ".join(digits[i:i + 4] for i in range(0, len(digits), 4))


def fmt_iban(rng: random.Random, iban: str) -> str:
    style = rng.random()
    if style < 0.6:
        return group4(iban)
    if style < 0.8:
        return iban
    return f"{iban[:4]} {iban[4:8]} {iban[8:12]} {iban[12:23]} {iban[23:]}"


def fmt_nif(rng: random.Random, nif: str) -> str:
    return nif if rng.random() < 0.5 else f"{nif[:3]} {nif[3:6]} {nif[6:]}"


def fmt_niss(rng: random.Random, niss: str) -> str:
    style = rng.random()
    if style < 0.6:
        return niss
    if style < 0.8:
        return f"{niss[0]} {niss[1:5]} {niss[5:8]} {niss[8:]}"
    return f"{niss[:5]} {niss[5:]}"


def fmt_cc(rng: random.Random, cc: str) -> str:
    style = rng.random()
    if style < 0.5:
        return f"{cc[:8]} {cc[8]} {cc[9:]}"
    if style < 0.8:
        return f"{cc[:8]}-{cc[8:]}"
    return cc


def make_mobile(rng: random.Random) -> str:
    return rng.choice(["91", "92", "93", "96"]) + rand_digits(rng, 7)


def fmt_phone(rng: random.Random, number: str) -> str:
    grouped = f"{number[:3]} {number[3:6]} {number[6:]}"
    return rng.choice([
        grouped, grouped, f"+351 {grouped}", f"(+351) {grouped}",
        number, f"+351{number}", f"{number[:3]}-{number[3:6]}-{number[6:]}",
    ])


MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
          "agosto", "setembro", "outubro", "novembro", "dezembro"]


def fmt_date(d: date, style: str = "slash") -> str:
    if style == "slash":
        return d.strftime("%d/%m/%Y")
    if style == "dash":
        return d.strftime("%d-%m-%Y")
    if style == "iso":
        return d.isoformat()
    if style == "dots":
        return d.strftime("%d.%m.%Y")
    return f"{d.day} de {MONTHS[d.month - 1]} de {d.year}"


def rand_date(rng: random.Random, start: date, end: date) -> date:
    return start + timedelta(days=rng.randrange((end - start).days + 1))


def fmt_amount(value: float) -> str:
    """Portuguese amount: 1.450,00."""
    whole, cents = f"{value:.2f}".split(".")
    whole = f"{int(whole):,}".replace(",", ".")
    return f"{whole},{cents}"


# --------------------------------------------------------------------------
# People and places
# --------------------------------------------------------------------------

FEMALE = [
    "Ana", "Maria", "Beatriz", "Carla", "Catarina", "Inês", "Joana", "Leonor",
    "Mariana", "Sofia", "Teresa", "Rita", "Marta", "Helena", "Cláudia",
    "Patrícia", "Sandra", "Vera", "Isabel", "Filipa", "Matilde", "Carolina",
    "Lúcia", "Fernanda", "Raquel", "Margarida", "Susana", "Daniela", "Luísa",
    "Alexandra", "Rosa", "Célia", "Paula", "Diana", "Francisca",
]
MALE = [
    "João", "Pedro", "Miguel", "Tiago", "André", "Rui", "Nuno", "Bruno",
    "Carlos", "Diogo", "Francisco", "Gonçalo", "Hugo", "Luís", "Manuel",
    "Paulo", "Ricardo", "Sérgio", "Vasco", "Tomás", "Afonso", "Duarte",
    "Henrique", "Jorge", "Vítor", "António", "José", "Fernando", "Daniel",
    "Rafael", "Filipe", "Marco", "Eduardo", "Joaquim", "Alberto",
]
SURNAMES = [
    "Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa",
    "Rodrigues", "Martins", "Jesus", "Sousa", "Fernandes", "Gonçalves",
    "Gomes", "Lopes", "Marques", "Alves", "Almeida", "Ribeiro", "Pinto",
    "Carvalho", "Teixeira", "Moreira", "Correia", "Mendes", "Nunes", "Soares",
    "Vieira", "Monteiro", "Cardoso", "Rocha", "Raposo", "Neves", "Coelho",
    "Cruz", "Cunha", "Pires", "Ramos", "Reis", "Simões", "Antunes", "Matos",
    "Fonseca", "Machado", "Araújo", "Barbosa", "Tavares", "Lourenço",
    "Castro", "Figueiredo", "Azevedo", "Freitas", "Magalhães", "Brito",
    "Henriques", "Valente", "Baptista", "Faria", "Leal", "Nogueira",
    "Guerreiro", "Cabral", "Pacheco", "Amaral", "Esteves", "Vaz", "Macedo",
    "Lacerda", "Bento", "Loureiro", "Varela", "Borges", "Paiva", "Sequeira",
]
STREET_TYPES = ["Rua", "Rua", "Rua", "Avenida", "Praceta", "Travessa", "Largo"]
STREET_NAMES = [
    "das Flores", "de Santo António", "Dr. Manuel de Arriaga", "25 de Abril",
    "da Liberdade", "Almirante Reis", "do Comércio", "Engenheiro Duarte "
    "Pacheco", "da República", "Fernão de Magalhães", "José Afonso",
    "Cidade de Goa", "Sophia de Mello Breyner", "Alexandre Herculano",
    "dos Combatentes", "Luís de Camões", "Infante D. Henrique", "Padre Cruz",
    "Vasco da Gama", "Miguel Torga", "de São João", "da Boavista", "de Ceuta",
    "Marquês de Pombal", "Elias Garcia", "da Igreja", "do Rossio",
    "dos Bombeiros Voluntários", "Heróis do Ultramar", "da Fonte Nova",
    "Professor Egas Moniz", "Serpa Pinto", "Gago Coutinho", "da Escola",
    "do Moinho", "Nossa Senhora de Fátima", "Cândido dos Reis", "do Olival",
]
FLOORS = ["", "", "1.º", "2.º Dto.", "3.º Esq.", "4.º Frente", "r/c Dto.",
          "5.º C", "1.º andar", "lote 12", "Bloco B, 2.º", "cave", "6.º A"]
# locality, postal code prefix, landline prefix
PLACES = [
    ("Lisboa", "1000", "21"), ("Lisboa", "1700", "21"), ("Lisboa", "1500", "21"),
    ("Porto", "4000", "22"), ("Porto", "4150", "22"), ("Braga", "4700", "253"),
    ("Coimbra", "3000", "239"), ("Aveiro", "3800", "234"), ("Faro", "8000", "289"),
    ("Setúbal", "2900", "265"), ("Évora", "7000", "266"), ("Leiria", "2400", "244"),
    ("Viseu", "3500", "232"), ("Guimarães", "4800", "253"), ("Funchal", "9000", "291"),
    ("Ponta Delgada", "9500", "296"), ("Sintra", "2710", "21"),
    ("Almada", "2800", "21"), ("Amadora", "2700", "21"), ("Cascais", "2750", "21"),
    ("Oeiras", "2780", "21"), ("Loures", "2670", "21"), ("Matosinhos", "4450", "22"),
    ("Vila Nova de Gaia", "4400", "22"), ("Beja", "7800", "284"),
    ("Castelo Branco", "6000", "272"), ("Portimão", "8500", "282"),
    ("Santarém", "2000", "243"), ("Viana do Castelo", "4900", "258"),
    ("Bragança", "5300", "273"), ("Vila Real", "5000", "259"),
    ("Guarda", "6300", "271"), ("Covilhã", "6200", "275"),
    ("Torres Vedras", "2560", "261"), ("Odivelas", "2620", "21"),
    ("Barreiro", "2830", "21"), ("Caldas da Rainha", "2500", "262"),
    ("Tomar", "2300", "249"), ("Figueira da Foz", "3080", "233"),
]
DOMAINS = ["gmail.com", "gmail.com", "hotmail.com", "sapo.pt", "outlook.pt",
           "live.com.pt", "mail.pt", "iol.pt", "netcabo.pt", "yahoo.com",
           "protonmail.com", "correio-exemplo.pt"]
# (feminine, masculine)
PROFESSIONS = [
    ("Enfermeira", "Enfermeiro"), ("Professora do ensino básico",
                                   "Professor do ensino básico"),
    ("Contabilista certificada", "Contabilista certificado"),
    ("Técnica de farmácia", "Técnico de farmácia"),
    ("Engenheira civil", "Engenheiro civil"), ("Advogada", "Advogado"),
    ("Motorista de pesados", "Motorista de pesados"),
    ("Operadora de caixa", "Operador de caixa"), ("Cozinheira", "Cozinheiro"),
    ("Programadora", "Programador"), ("Assistente social", "Assistente social"),
    ("Eletricista", "Eletricista"), ("Rececionista", "Rececionista"),
    ("Fisioterapeuta", "Fisioterapeuta"), ("Gestora de produto",
                                           "Gestor de produto"),
    ("Agricultora", "Agricultor"), ("Carteira", "Carteiro"),
    ("Designer gráfica", "Designer gráfico"), ("Técnica de laboratório",
                                               "Técnico de laboratório"),
    ("Empregada de mesa", "Empregado de mesa"), ("Arquiteta", "Arquiteto"),
]
# Employers and schools of people: masked, unlike the institution that
# issues a document (ISSUERS), which stays visible.
EMPLOYERS = [
    "Hospital Exemplo de Lisboa Ocidental", "Metalúrgica Vale do Sorraia, Lda.",
    "Câmara Municipal de Vale Verde", "Supermercados Pinhal, S.A.",
    "Clínica Dentária Sorriso do Tejo", "Transportes Beira Alta, Lda.",
    "Farmácia Central de Alcobaça", "Hotel Monte da Ria",
    "Construções Irmãos Figueira, Lda.", "Universidade Lusitana do Norte",
    "Banco Exemplo, S.A.", "Seguradora Atlântico Vida", "Padaria São Roque",
    "Lemos & Associados, Sociedade de Advogados", "Escola Secundária Ferreira "
    "de Castro", "Restaurante O Lavrador", "Quinta da Boa Esperança",
    "CTT Exemplo, Loja de Alcântara", "Startup Nuvem Azul, Lda.",
    "Lar de Idosos Recanto do Sol", "Agrupamento de Escolas da Ribeira Nova",
]
SCHOOLS = [
    "Escola Básica e Secundária de Vale Verde",
    "Escola Secundária Alves Martins", "Colégio da Luz",
    "Escola Básica 2,3 de Marvila", "Instituto Politécnico do Tâmega",
    "Externato Santa Joana", "Escola Profissional de Hotelaria do Oeste",
]
CONDITIONS = [
    "hipertensão arterial", "diabetes tipo 2", "asma brônquica",
    "hipotiroidismo", "artrose do joelho direito", "enxaqueca crónica",
    "depressão major em tratamento", "rinite alérgica", "epilepsia controlada",
    "dislipidemia", "apneia do sono", "doença celíaca",
]
MEDICATIONS = [
    "Metformina 850 mg 2x/dia", "Losartan 50 mg 1x/dia",
    "Levotiroxina 75 mcg em jejum", "Salbutamol inalador SOS",
    "Sertralina 50 mg 1x/dia", "Atorvastatina 20 mg à noite",
    "Ibuprofeno 400 mg se dor", "Omeprazol 20 mg 1x/dia",
    "Levetiracetam 500 mg 2x/dia", "Cetirizina 10 mg 1x/dia",
]
ALLERGIES = ["penicilina", "látex", "amendoim", "marisco", "pólen", "ácaros",
             "iodo", "nenhuma conhecida"]
DEPARTMENTS = ["Operações", "Apoio ao Cliente", "Recursos Humanos",
               "Financeiro", "Rede e Infraestrutura", "Comercial", "Jurídico",
               "Marketing", "Sistemas de Informação", "Logística"]
JOB_TITLES = ["Técnico de instalação", "Assistente de apoio ao cliente",
              "Analista financeiro", "Gestor de conta", "Engenheiro de rede",
              "Técnica de RH", "Jurista", "Designer", "Administrador de "
              "sistemas", "Operador de logística", "Coordenador de equipa"]
PLANS = ["Fibra 500", "Fibra 1G", "Fibra 1G + TV", "Fibra 500 + TV",
         "Móvel 20GB", "Móvel 50GB", "Pack Casa Total", "Fibra 200"]
PRICES = {"Fibra 500": 39.99, "Fibra 1G": 44.99, "Fibra 1G + TV": 54.99,
          "Fibra 500 + TV": 47.99, "Móvel 20GB": 12.99, "Móvel 50GB": 19.99,
          "Pack Casa Total": 64.99, "Fibra 200": 29.99}
RELATIONS_F = ["mãe", "irmã", "filha", "esposa", "companheira", "amiga", "avó",
               "tia", "sobrinha"]
RELATIONS_M = ["pai", "irmão", "filho", "marido", "companheiro", "amigo",
               "avô", "tio", "sobrinho"]


@dataclass
class Address:
    street: str
    number: str
    floor: str
    postal: str
    locality: str
    landline_prefix: str

    @property
    def full(self) -> str:
        parts = [f"{self.street}, {self.number}"]
        if self.floor:
            parts.append(self.floor)
        parts.append(f"{self.postal} {self.locality}")
        return ", ".join(parts)

    @property
    def street_line(self) -> str:
        return f"{self.street}, {self.number}" + (
            f", {self.floor}" if self.floor else "")

    @property
    def postal_line(self) -> str:
        return f"{self.postal} {self.locality}"


@dataclass
class Person:
    sex: str  # "F" or "M"
    first: str
    middles: list[str]
    last: str
    dob: date
    nif: str
    cc: str
    niss: str
    sns: str
    address: Address
    mobile: str
    landline: str
    email: str
    iban: str
    bank: str
    profession: str
    employer: str
    salary: float
    username: str

    @property
    def name(self) -> str:
        return " ".join([self.first, *self.middles, self.last])

    @property
    def short(self) -> str:
        return f"{self.first} {self.last}"

    @property
    def initials(self) -> str:
        return f"{self.first} {''.join(m[0] + '.' for m in self.middles)} " \
               f"{self.last}".replace("  ", " ")

    @property
    def age(self) -> int:
        today = date(2026, 10, 1)
        return today.year - self.dob.year - (
            (today.month, today.day) < (self.dob.month, self.dob.day))

    @property
    def title(self) -> str:
        return "Sra." if self.sex == "F" else "Sr."

    @property
    def dr(self) -> str:
        return "Dra." if self.sex == "F" else "Dr."

    @property
    def pronoun_article(self) -> str:
        return "a" if self.sex == "F" else "o"


def make_address(rng: random.Random) -> Address:
    locality, prefix, landline = rng.choice(PLACES)
    return Address(
        street=f"{rng.choice(STREET_TYPES)} {rng.choice(STREET_NAMES)}",
        number=str(rng.randint(1, 240)),
        floor=rng.choice(FLOORS),
        postal=f"{prefix}-{rand_digits(rng, 3)}",
        locality=locality,
        landline_prefix=landline,
    )


def make_person(rng: random.Random, min_age: int = 18,
                max_age: int = 80) -> Person:
    sex = rng.choice("FM")
    first = rng.choice(FEMALE if sex == "F" else MALE)
    middles = rng.sample(SURNAMES, rng.choice([0, 1, 1, 2]))
    last = rng.choice([s for s in SURNAMES if s not in middles])
    address = make_address(rng)
    birth_end = date(2026, 10, 1) - timedelta(days=365 * min_age + 200)
    birth_start = date(2026, 10, 1) - timedelta(days=365 * max_age)
    plain_first = strip_accents(first).lower()
    plain_last = strip_accents(last).lower()
    dob = rand_date(rng, birth_start, birth_end)
    email_local = rng.choice([
        f"{plain_first}.{plain_last}", f"{plain_first[0]}{plain_last}",
        f"{plain_first}{plain_last}{dob.year % 100:02d}",
        f"{plain_first}.{plain_last}{rng.randint(1, 99)}",
        f"{plain_first}_{plain_last}",
    ])
    bank_code, bank = rng.choice(BANKS)
    prof_f, prof_m = rng.choice(PROFESSIONS)
    return Person(
        sex=sex, first=first, middles=middles, last=last, dob=dob,
        nif=make_nif(rng), cc=make_cc(rng), niss=make_niss(rng),
        sns=rand_digits(rng, 9, "123"), address=address,
        mobile=make_mobile(rng),
        landline=address.landline_prefix + rand_digits(
            rng, 9 - len(address.landline_prefix)),
        email=f"{email_local}@{rng.choice(DOMAINS)}",
        iban=make_iban(rng, bank_code), bank=bank,
        profession=prof_f if sex == "F" else prof_m,
        employer=rng.choice(EMPLOYERS),
        salary=rng.choice([870, 920, 1050, 1180, 1250, 1400, 1450, 1620,
                           1800, 2100, 2350, 2800, 3200]) + rng.choice(
            [0, 0, 0.5, 0.25]),
        username=rng.choice([f"{plain_first[0]}{plain_last}",
                             f"{plain_first}.{plain_last}",
                             f"{plain_first}{dob.year % 100:02d}"]),
    )


def strip_accents(text: str) -> str:
    import unicodedata
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def relative(rng: random.Random, person: Person) -> tuple[Person, str]:
    """A family member or friend, with the relation word."""
    other = make_person(rng)
    other.last = person.last if rng.random() < 0.6 else other.last
    relation = rng.choice(RELATIONS_F if other.sex == "F" else RELATIONS_M)
    return other, relation


def styled_digits(text: str) -> str:
    """Mathematical bold digits (𝟵𝟭𝟮), as pasted from some chats."""
    return "".join(chr(0x1D7EC + int(c)) if c.isdigit() else c for c in text)


def struck(text: str) -> str:
    """Strike every character through with U+0336."""
    return "".join(c + "̶" for c in text)


# --------------------------------------------------------------------------
# Text templates. Each returns the lines of a document with the sensitive
# values marked. Blank lines are allowed (clean_lines drops them).
# --------------------------------------------------------------------------

TELCO = "LUSOFIBRA TELECOMUNICAÇÕES, S.A."
HOSPITAL = "Hospital de Santa Luzia do Vale"
SCHOOL = "Agrupamento de Escolas de Vale Verde"
INSURER = "Seguradora Atlântico Vida, S.A."


def t_ficha_cliente(rng, p: Person) -> list[str]:
    plan = rng.choice(PLANS)
    other, relation = relative(rng, p)
    return [
        f"{TELCO}",
        "FICHA DE CLIENTE",
        f"Data de criação: {fmt_date(rand_date(rng, date(2026, 1, 5), date(2026, 9, 30)))}",
        "",
        "TITULAR",
        f"Nome: {S(p.name)}",
        f"Data de nascimento: {S(fmt_date(p.dob))}",
        f"NIF: {S(fmt_nif(rng, p.nif))}",
        f"Cartão de Cidadão: {S(fmt_cc(rng, p.cc))}",
        f"Morada de instalação: {S(p.address.full)}",
        f"Telemóvel: {S(fmt_phone(rng, p.mobile))}",
        f"Telefone fixo: {S(fmt_phone(rng, p.landline))}",
        f"Email: {S(p.email)}",
        f"Profissão: {p.profession}",
        "",
        "SERVIÇO",
        f"Tarifário: {plan}",
        f"Mensalidade: {fmt_amount(PRICES[plan])} EUR",
        f"Fidelização: {rng.choice([12, 24])} meses",
        f"Equipamento: router {rng.choice(['ZTE H3600', 'Huawei HG8245', 'Nokia G-240W'])}, n.º de série {rng.choice(['ZTEG', 'HWTC', 'ALCL'])}{rand_digits(rng, 8).upper()}",
        "",
        "PAGAMENTO",
        f"Débito direto na conta com o IBAN {S(fmt_iban(rng, p.iban))} ({p.bank})",
        f"Referência da autorização: ADD-{rand_digits(rng, 7)}",
        "",
        "CONTACTO ALTERNATIVO",
        f"{S(other.name)} ({relation}), telemóvel {S(fmt_phone(rng, other.mobile))}",
        "",
        f"Registado por: {S(make_person(rng).short)}, Loja de {rng.choice(PLACES)[0]}",
    ]


def t_email_reclamacao(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 6, 1), date(2026, 9, 30))
    tech = make_person(rng)
    return [
        f"De: {S(p.name)} <{S(p.email)}>",
        "Para: reclamacoes@lusofibra.pt",
        f"Data: {fmt_date(day, 'long')}, {rng.randint(8, 21)}:{rng.randint(10, 59)}",
        f"Assunto: Reclamação - fatura n.º FT{day.year}/{rand_digits(rng, 5)}",
        "",
        "Bom dia,",
        "",
        f"Venho reclamar da fatura acima indicada, no valor de {fmt_amount(rng.uniform(60, 190))} EUR, que inclui {rng.randint(2, 6)} chamadas internacionais que não fiz.",
        f"Sou cliente desde {rng.randint(2015, 2024)} e nunca tive este problema. No dia {fmt_date(day - timedelta(days=rng.randint(3, 20)))} liguei para o apoio e falei com {pronoun(tech)} {S(tech.first)}, que me disse que iam verificar, mas não recebi resposta.",
        f"Para confirmarem a minha identidade: NIF {S(fmt_nif(rng, p.nif))}, morada de instalação na {S(p.address.full)}.",
        f"Peço a anulação dos valores indevidos e a correção do débito direto, que é feito na conta {S(fmt_iban(rng, p.iban))}.",
        "",
        f"Podem contactar-me pelo {S(fmt_phone(rng, p.mobile))} depois das 18h, ou por este email.",
        "",
        "Com os melhores cumprimentos,",
        f"{S(p.name)}",
        f"{p.profession}, {p.age} anos",
    ]


def pronoun(person: Person) -> str:
    return "a" if person.sex == "F" else "o"


def t_notas_chamada(rng, p: Person) -> list[str]:
    agent = make_person(rng)
    day = rand_date(rng, date(2026, 7, 1), date(2026, 10, 5))
    other, relation = relative(rng, p)
    new_phone = make_mobile(rng)
    return [
        f"NOTAS DE CHAMADA - APOIO AO CLIENTE {TELCO}",
        f"Chamada n.º CH-{rand_digits(rng, 7)} | {fmt_date(day)} {rng.randint(9, 20)}h{rng.randint(10, 59)} | Duração: {rng.randint(4, 22)} min",
        f"Agente: {S(agent.short)} (equipa {rng.choice(['NORTE', 'CENTRO', 'SUL'])}-{rng.randint(1, 9):02d})",
        "",
        f"Cliente identificad{pronoun(p)} com NIF {S(fmt_nif(rng, p.nif))} e data de nascimento {S(fmt_date(p.dob, 'dash'))}.",
        f"Titular: {S(p.name)}. Ligou do número {S(fmt_phone(rng, p.landline))}.",
        "",
        "Motivo:",
        f"- Sem internet desde ontem à noite na morada {S(p.address.street_line)}, {S(p.address.postal_line)}.",
        f"- Luz LOS a vermelho no router. Reiniciou {rng.randint(1, 3)} vezes sem resultado.",
        "",
        "Ações:",
        f"- Teste remoto de linha: sem sinal ótico. Aberta ordem de trabalho OT-{rand_digits(rng, 9)}.",
        f"- Visita técnica marcada para {fmt_date(day + timedelta(days=rng.randint(1, 4)))}, período da {rng.choice(['manhã', 'tarde'])}.",
        f"- Cliente pede que o técnico ligue antes para {S(fmt_phone(rng, new_phone))} (número d{pronoun(other)} {relation}, {S(other.first)}), porque vai estar a trabalhar.",
        f"- Atualizado o email de contacto para {S(p.email)}.",
        "",
        f"Observações: cliente {rng.choice(['calmo', 'irritado mas cordial', 'com pressa'])}; trabalha como {p.profession.lower()} e precisa da ligação para teletrabalho.",
    ]


def t_ficha_rh(rng, p: Person) -> list[str]:
    hr = make_person(rng)
    other, relation = relative(rng, p)
    admission = rand_date(rng, date(2026, 1, 2), date(2026, 10, 1))
    return [
        f"{TELCO}",
        "Direção de Recursos Humanos",
        "FICHA DE ADMISSÃO DE COLABORADOR (CONFIDENCIAL)",
        "",
        f"Número mecanográfico: {S(rand_digits(rng, 6, '1'))}",
        f"Data de admissão: {fmt_date(admission)}",
        f"Função: {rng.choice(JOB_TITLES)}, {rng.choice(DEPARTMENTS)}",
        f"Centro de custo: CC-{rng.choice(['TEC', 'ADM', 'COM'])}-{rng.randint(1, 20):02d}",
        f"Vencimento base: {S(fmt_amount(p.salary))} EUR",
        "",
        "DADOS PESSOAIS",
        f"Nome: {S(p.name)}",
        f"Data de nascimento: {S(fmt_date(p.dob))}",
        "Nacionalidade: Portuguesa",
        f"Estado civil: {rng.choice(['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'União de facto'])}",
        f"Cartão de Cidadão: {S(fmt_cc(rng, p.cc))}",
        f"NIF: {S(fmt_nif(rng, p.nif))}",
        f"NISS: {S(fmt_niss(rng, p.niss))}",
        f"N.º de utente do SNS: {S(p.sns[:3] + ' ' + p.sns[3:6] + ' ' + p.sns[6:])}",
        "",
        "CONTACTOS",
        f"Morada: {S(p.address.full)}",
        f"Telemóvel: {S(fmt_phone(rng, p.mobile))}",
        f"Email pessoal: {S(p.email)}",
        f"Contacto de emergência: {S(other.name)} ({relation}), {S(fmt_phone(rng, other.mobile))}",
        "",
        "DADOS BANCÁRIOS (processamento de salário)",
        f"IBAN: {S(fmt_iban(rng, p.iban))}",
        "",
        "DADOS PARA SEGURO E MEDICINA DO TRABALHO",
        f"Grupo sanguíneo: {rng.choice(['A+', 'O+', 'B-', 'AB+', 'O-'])}",
        f"Restrições: alergia a {rng.choice(ALLERGIES)}. {rng.choice(CONDITIONS).capitalize()}, comunicada pel{pronoun(p)} colaborador{'a' if p.sex == 'F' else ''}.",
        f"Empregador anterior: {S(p.employer)}",
        "",
        f"Validado por: {S(hr.name)}, Técnic{pronoun(hr)} de RH",
    ]


def t_carta_rescisao(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 5, 1), date(2026, 9, 30))
    manager = make_person(rng)
    return [
        f"{S(p.name)}",
        f"{S(p.address.street_line)}",
        f"{S(p.address.postal_line)}",
        f"{S(fmt_phone(rng, p.mobile))} | {S(p.email)}",
        "",
        f"{TELCO}",
        "Direção de Recursos Humanos",
        "Avenida da Liberdade, 210",
        "1250-147 Lisboa",
        "",
        f"{p.address.locality}, {fmt_date(day, 'long')}",
        "",
        "Assunto: Denúncia do contrato de trabalho por iniciativa do trabalhador",
        "",
        f"Exm{pronoun(manager)}. Senhor{'a' if manager.sex == 'F' else ''} {S(manager.name)},",
        "",
        f"Nos termos do artigo 400.º do Código do Trabalho, venho comunicar a denúncia do meu contrato de trabalho sem termo, celebrado em {fmt_date(rand_date(rng, date(2017, 1, 1), date(2024, 12, 31)))}, com efeitos a partir de {fmt_date(day + timedelta(days=60))}, cumprindo assim o aviso prévio de 60 dias.",
        f"Exerço as funções de {rng.choice(JOB_TITLES).lower()} no departamento de {rng.choice(DEPARTMENTS)} com o número mecanográfico {S(rand_digits(rng, 6, '1'))}.",
        "",
        f"Solicito que a compensação por férias não gozadas e os proporcionais de subsídio de férias e de Natal sejam transferidos para a conta habitual, com o IBAN {S(fmt_iban(rng, p.iban))}, e que o certificado de trabalho seja enviado para a morada acima.",
        f"Aceitei uma proposta de {S(rng.choice(EMPLOYERS))} para uma função semelhante, com um vencimento de {S(fmt_amount(p.salary + 300))} EUR brutos.",
        "",
        "Agradeço estes anos de colaboração e fico ao dispor para assegurar a passagem de pasta.",
        "",
        "Com os melhores cumprimentos,",
        "",
        f"{S(p.initials)}",
        f"NIF {S(fmt_nif(rng, p.nif))}",
    ]


def t_relatorio_tecnico(rng, p: Person) -> list[str]:
    tech = make_person(rng)
    day = rand_date(rng, date(2026, 7, 1), date(2026, 10, 5))
    lat = round(rng.uniform(37.0, 41.8), 6)
    lon = round(rng.uniform(-9.5, -6.2), 6)
    other, relation = relative(rng, p)
    return [
        "RELATÓRIO DE INTERVENÇÃO TÉCNICA",
        f"Ordem de trabalho: OT-{rand_digits(rng, 9)}",
        f"Técnico: {S(tech.name)} (equipa {rng.choice(['LISBOA', 'PORTO', 'SETÚBAL', 'COIMBRA'])}-{rng.randint(1, 9):02d})",
        f"Data da visita: {fmt_date(day)}, {rng.randint(8, 15)}h{rng.randint(10, 59):02d} às {rng.randint(16, 18)}h{rng.randint(10, 59):02d}",
        "",
        f"Cliente: {S(p.name)}",
        f"NIF cliente: {S(fmt_nif(rng, p.nif))}",
        f"Morada: {S(p.address.full)}",
        f"Coordenadas GPS da caixa de rua: {S(f'{lat} N, {abs(lon)} W')}",
        f"Contacto no local: {pronoun(p)} própri{pronoun(p)}, tel. {S(fmt_phone(rng, p.mobile))}",
        "",
        "Descrição da avaria reportada:",
        f"{rng.choice(['Perda de sinal intermitente na fibra, sobretudo ao fim da tarde.', 'Sem serviço de TV há três dias; internet funciona.', 'Velocidade muito abaixo do contratado (medidos 40 Mbps em 500).', 'Ruído na linha telefónica e quedas de chamada.'])} Cliente refere que trabalha em casa e perdeu reuniões.",
        "",
        "Diagnóstico:",
        f"Conector SC/APC da roseta danificado. Atenuação medida na ONT: -{rng.randint(24, 31)},{rng.randint(0, 9)} dBm (fora do limite). Cabo de drop com dobra junto à caixa do prédio.",
        "",
        "Trabalho realizado:",
        "1. Substituição do conector e da roseta ótica.",
        "2. Reposicionamento do cabo de drop na caixa de entrada do prédio.",
        f"3. Nova medição na ONT: -{rng.randint(17, 21)},{rng.randint(0, 9)} dBm (dentro do limite).",
        f"4. Teste de velocidade: {rng.randint(880, 940)} Mbps download / {rng.randint(400, 500)} Mbps upload.",
        "",
        f"Material aplicado: 1 roseta ótica, 2 conectores SC/APC, {rng.randint(2, 6)} m de cabo de drop.",
        f"Equipamento do cliente: ONT n.º série {rng.choice(['ZTEG', 'HWTC'])}-{rand_digits(rng, 4)}-{rand_digits(rng, 4)} (mantida).",
        "",
        "Observações:",
        f"{pronoun(other).upper()} {relation} d{pronoun(p)} cliente, {other.title} {S(other.last)}, pediu que futuras visitas sejam marcadas para depois das 14h00 e deixou o contacto {S(fmt_phone(rng, other.mobile))}.",
        "",
        f"Assinatura do cliente: {S(p.initials)}",
        f"Assinatura do técnico: {S(tech.first[0] + '. ' + tech.last)}",
    ]


def t_procuracao(rng, p: Person) -> list[str]:
    agent = make_person(rng)
    lawyer = make_person(rng)
    day = rand_date(rng, date(2026, 3, 1), date(2026, 9, 30))
    return [
        "PROCURAÇÃO",
        "",
        f"{S(p.name)}, {'solteira' if p.sex == 'F' else 'solteiro'}, maior, {p.profession.lower()}, portador{'a' if p.sex == 'F' else ''} do Cartão de Cidadão n.º {S(fmt_cc(rng, p.cc))}, contribuinte fiscal n.º {S(fmt_nif(rng, p.nif))}, residente na {S(p.address.full)}, constitui {'sua' if agent.sex == 'F' else 'seu'} bastante procurador{'a' if agent.sex == 'F' else ''}",
        f"{S(agent.name)}, {agent.profession.lower()}, portador{'a' if agent.sex == 'F' else ''} do Cartão de Cidadão n.º {S(fmt_cc(rng, agent.cc))}, com domicílio profissional na {S(agent.address.full)},",
        "",
        f"a quem confere os poderes necessários para, em seu nome e representação, celebrar, alterar e cessar contratos de telecomunicações com a {TELCO}, incluindo a mudança de titularidade do contrato n.º LF-{day.year}-{rand_digits(rng, 7)}, a alteração da morada de instalação e dos dados de pagamento, e a receção de equipamentos, podendo para o efeito assinar tudo o que for necessário.",
        "",
        f"A presente procuração é válida por {rng.choice([90, 180, 365])} dias a contar desta data.",
        "",
        f"{p.address.locality}, {fmt_date(day, 'long')}",
        "",
        f"{'A' if p.sex == 'F' else 'O'} mandante: {S(p.name)}",
        f"Contactos d{pronoun(p)} mandante: {S(fmt_phone(rng, p.mobile))}, {S(p.email)}",
        "",
        f"Reconheço a assinatura, feita na minha presença. {S(lawyer.name)}, Advogad{pronoun(lawyer)}, cédula profissional n.º {S(rand_digits(rng, 5, '123') + rng.choice('LPCF'))}.",
    ]


def t_chat_apoio(rng, p: Person) -> list[str]:
    agent = make_person(rng)
    day = rand_date(rng, date(2026, 8, 1), date(2026, 10, 5))
    other, relation = relative(rng, p)
    h, m = rng.randint(9, 21), rng.randint(0, 50)
    stamp = fmt_date(day)
    new_email = f"{strip_accents(p.first).lower()}.{strip_accents(p.last).lower()}@{rng.choice(DOMAINS)}"
    plan = rng.choice(PLANS)
    lines = [
        f"[Transcrição do chat de apoio, sessão #CH-{rand_digits(rng, 7)}]",
        f"[{stamp} {h}:{m:02d}] Assistente Lusofibra: Olá! Sou {pronoun(agent)} {S(agent.first)}, em que posso ajudar?",
        f"[{stamp} {h}:{m:02d}] Cliente: boa tarde, queria mudar o tarifário para o {plan}",
        f"[{stamp} {h}:{m + 1:02d}] Assistente Lusofibra: Claro. Para validar a sua identidade, pode indicar o NIF do titular e a data de nascimento?",
        f"[{stamp} {h}:{m + 1:02d}] Cliente: {S(p.nif)}, {S(fmt_date(p.dob, 'dash'))}",
        f"[{stamp} {h}:{m + 2:02d}] Assistente Lusofibra: Obrigad{pronoun(agent)}. Confirmo que fala com {pronoun(p)} titular {S(p.name)}?",
        f"[{stamp} {h}:{m + 2:02d}] Cliente: sim sou eu, {pronoun(p)} {S(p.first.lower())}",
        f"[{stamp} {h}:{m + 3:02d}] Cliente: aproveito para atualizar o email, agora é {S(new_email)} e o tlm passou a ser {S(fmt_phone(rng, make_mobile(rng)))}",
        f"[{stamp} {h}:{m + 4:02d}] Assistente Lusofibra: Atualizado. A morada de instalação mantém-se na {S(p.address.full)}?",
        f"[{stamp} {h}:{m + 4:02d}] Cliente: sim",
        f"[{stamp} {h}:{m + 5:02d}] Cliente: ah e o pagamento passa a ser pela conta d{pronoun(other)} {'minha' if other.sex == 'F' else 'meu'} {relation}, {S(other.short)}, o iban é {S(fmt_iban(rng, other.iban))}. {'ela' if other.sex == 'F' else 'ele'} autoriza",
        f"[{stamp} {h}:{m + 6:02d}] Assistente Lusofibra: Para alterar o débito para uma conta de outra pessoa preciso da autorização d{pronoun(other)} titular. Vou enviar o formulário para o seu novo email.",
        f"[{stamp} {h}:{m + 6:02d}] Cliente: ok obrigad{pronoun(p)} {S(agent.first.lower())}",
        f"[{stamp} {h}:{m + 7:02d}] Assistente Lusofibra: A alteração de tarifário para {plan} ({fmt_amount(PRICES[plan])} EUR/mês) fica ativa amanhã. Obrigad{pronoun(agent)} e boa tarde!",
        "[Fim da sessão]",
    ]
    return lines


def t_declaracao_medica(rng, p: Person) -> list[str]:
    doctor = make_person(rng)
    day = rand_date(rng, date(2026, 4, 1), date(2026, 10, 5))
    conditions = rng.sample(CONDITIONS, 2)
    return [
        f"{HOSPITAL}",
        f"Serviço de {rng.choice(['Medicina Interna', 'Ortopedia', 'Cardiologia', 'Pneumologia'])}",
        "DECLARAÇÃO MÉDICA",
        "",
        f"Declaro que {S(p.name)}, nascid{pronoun(p)} a {S(fmt_date(p.dob, 'long'))}, utente n.º {S(p.sns)}, NIF {S(fmt_nif(rng, p.nif))}, residente em {S(p.address.full)}, esteve em consulta neste serviço no dia {fmt_date(day)}.",
        "",
        f"{'A' if p.sex == 'F' else 'O'} utente, {p.age} anos, {p.profession.lower()}, apresenta {conditions[0]} e {conditions[1]}, diagnosticadas há {rng.randint(1, 12)} anos, e encontra-se medicad{pronoun(p)} com {rng.choice(MEDICATIONS)} e {rng.choice(MEDICATIONS)}.",
        f"Alergias conhecidas: {rng.choice(ALLERGIES)}.",
        f"Tensão arterial na consulta: {rng.randint(115, 150)}/{rng.randint(70, 95)} mmHg. Peso: {rng.randint(55, 98)} kg. Altura: 1,{rng.randint(55, 88)} m.",
        "",
        f"Por motivo de doença, {pronoun(p)} utente encontra-se incapacitad{pronoun(p)} para o trabalho por um período de {rng.choice([3, 5, 8, 15])} dias, de {fmt_date(day)} a {fmt_date(day + timedelta(days=rng.choice([3, 5, 8, 15])))}, a apresentar à entidade empregadora, {S(p.employer)}.",
        f"Recomenda-se repouso, hidratação e reavaliação em consulta se os sintomas persistirem. Contacto do utente para marcação: {S(fmt_phone(rng, p.mobile))}.",
        "",
        f"{p.address.locality}, {fmt_date(day, 'long')}",
        "",
        f"{doctor.dr} {S(doctor.name)}",
        f"Médic{pronoun(doctor)} especialista, cédula da Ordem dos Médicos n.º {S(rand_digits(rng, 5, '3456'))}",
        f"Contacto do serviço: {S(fmt_phone(rng, doctor.landline))} | {S(strip_accents(doctor.first).lower() + '.' + strip_accents(doctor.last).lower() + '@hsluzia-exemplo.pt')}",
    ]


def t_recibo_vencimento(rng, p: Person) -> list[str]:
    month = rng.randint(1, 9)
    base = p.salary
    meal = 9.6 * rng.randint(19, 22)
    irs = round(base * rng.uniform(0.08, 0.21), 2)
    ss = round(base * 0.11, 2)
    return [
        f"{TELCO}",
        f"RECIBO DE VENCIMENTO - {MONTHS[month - 1].capitalize()} de 2026",
        "",
        f"Colaborador: {S(p.name)}",
        f"N.º mecanográfico: {S(rand_digits(rng, 6, '1'))}",
        f"Categoria: {rng.choice(JOB_TITLES)}",
        f"Departamento: {rng.choice(DEPARTMENTS)}",
        f"NIF: {S(fmt_nif(rng, p.nif))}    NISS: {S(fmt_niss(rng, p.niss))}",
        f"Morada: {S(p.address.full)}",
        "",
        "ABONOS",
        f"Vencimento base ............ {S(fmt_amount(base))} EUR",
        f"Subsídio de alimentação .... {fmt_amount(meal)} EUR ({int(meal / 9.6)} dias x 9,60)",
        f"Trabalho suplementar ....... {fmt_amount(rng.choice([0, 48.5, 97, 120.25]))} EUR",
        "",
        "DESCONTOS",
        f"IRS ({round(irs / base * 100, 1)}%) ................. {fmt_amount(irs)} EUR",
        f"Segurança Social (11%) ..... {fmt_amount(ss)} EUR",
        f"Sindicato .................. {fmt_amount(rng.choice([0, 7.5, 9]))} EUR",
        "",
        f"VALOR LÍQUIDO .............. {S(fmt_amount(base + meal - irs - ss))} EUR",
        f"Pago por transferência para o IBAN {S(fmt_iban(rng, p.iban))} em {fmt_date(date(2026, month, 28))}.",
        "",
        "Este recibo foi emitido por processamento automático e não precisa de assinatura.",
        f"Dúvidas: Recursos Humanos, ext. {rng.randint(2000, 2999)}, ou rh@lusofibra.pt.",
    ]


def t_ata_condominio(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 2, 1), date(2026, 9, 30))
    address = make_address(rng)
    admin = make_person(rng)
    owners = [make_person(rng) for _ in range(4)]
    fractions = ["A", "B", "C", "D", "E", "F", "G", "H"]
    present = [
        f"- Fração {fractions[i]}: {S(o.name)}, {rng.randint(80, 180)} permilagem"
        for i, o in enumerate(owners)
    ]
    return [
        f"CONDOMÍNIO DO PRÉDIO SITO NA {S(address.street.upper() + ', ' + address.number)}, {S(address.postal_line.upper())}",
        f"ATA N.º {rng.randint(12, 40)} DA ASSEMBLEIA ORDINÁRIA DE CONDÓMINOS",
        "",
        f"Aos {fmt_date(day, 'long')}, pelas {rng.randint(18, 21)} horas, reuniu no átrio do prédio a assembleia de condóminos, com a presença dos seguintes proprietários:",
        *present,
        f"Esteve também presente {pronoun(admin)} administrador{'a' if admin.sex == 'F' else ''} do condomínio, {S(admin.name)}, da empresa {rng.choice(['Gerelar Condomínios, Lda.', 'Prediviva Gestão, Lda.'])}.",
        "",
        "ORDEM DE TRABALHOS",
        f"1. Aprovação das contas de {day.year - 1}: receitas de {fmt_amount(rng.uniform(9000, 16000))} EUR e despesas de {fmt_amount(rng.uniform(8000, 15000))} EUR. Aprovadas por unanimidade.",
        f"2. Orçamento para {day.year + 1}: quota mensal de {fmt_amount(rng.uniform(35, 80))} EUR por fração. Aprovado com o voto contra da fração {fractions[2]}.",
        f"3. Obras na cobertura: adjudicadas à empresa {rng.choice(['Telhados do Norte, Lda.', 'Impermeabilizações Rocha & Filhos'])} pelo valor de {fmt_amount(rng.uniform(6000, 14000))} EUR, a pagar em 3 prestações.",
        f"4. Dívidas: a fração {fractions[3]} tem {rng.randint(3, 9)} quotas em atraso. {pronoun(owners[3]).upper()} condómin{pronoun(owners[3])} {owners[3].title} {S(owners[3].last)} comprometeu-se a regularizar até {fmt_date(day + timedelta(days=60))} por transferência para a conta do condomínio, IBAN {group4(make_iban(rng))}.",
        f"5. O condómino da fração {fractions[1]} pediu que o número da portaria seja atualizado para {S(fmt_phone(rng, owners[1].mobile))}.",
        "",
        f"Nada mais havendo a tratar, foi encerrada a reunião pelas {rng.randint(20, 23)} horas, lavrando-se a presente ata, que vai ser assinada pel{pronoun(admin)} administrador{'a' if admin.sex == 'F' else ''} e pelo condómino que presidiu, {S(owners[0].name)}.",
        "",
        f"{'A' if admin.sex == 'F' else 'O'} administrador{'a' if admin.sex == 'F' else ''}: {S(admin.initials)}",
        f"O presidente da mesa: {S(owners[0].initials)}",
    ]


def t_ficha_aluno(rng, student: Person) -> list[str]:
    parent, _ = relative(rng, student)
    parent.sex = rng.choice("FM")
    relation = "mãe" if parent.sex == "F" else "pai"
    teacher = make_person(rng)
    year = rng.choice([5, 6, 7, 8, 9, 10, 11, 12])
    return [
        f"{SCHOOL}",
        f"{rng.choice(SCHOOLS)}",
        "Ficha individual do aluno - Ano letivo 2026/2027",
        "",
        f"Aluno N.º {S(rand_digits(rng, 5, '12'))}, Turma {year}.º {rng.choice('ABCDE')}",
        f"Nome: {S(student.name)}",
        f"N.º de processo: {S('P-' + rand_digits(rng, 4) + '/' + str(rng.randint(15, 24)))}",
        f"Cartão de estudante n.º {S('CE-' + rand_digits(rng, 5))}",
        f"Data de nascimento: {S(fmt_date(student.dob))}",
        f"NIF: {S(fmt_nif(rng, student.nif))}",
        f"N.º de utente: {S(student.sns)}",
        f"Morada: {S(student.address.full)}",
        "",
        f"Encarregad{pronoun(parent)} de educação: {S(parent.name)} ({relation})",
        f"Telemóvel: {S(fmt_phone(rng, parent.mobile))}",
        f"Email: {S(parent.email)}",
        f"Profissão: {parent.profession.lower()}, em {S(parent.employer)}",
        "",
        f"Diretor{'a' if teacher.sex == 'F' else ''} de turma: Prof.{'ª' if teacher.sex == 'F' else ''} {S(teacher.short)}",
        f"N.º mecanográfico d{pronoun(teacher)} diretor{'a' if teacher.sex == 'F' else ''} de turma: {S(rand_digits(rng, 4))}",
        "",
        "Avaliação do 1.º período:",
        f"Português {rng.randint(2, 5)}, Matemática {rng.randint(2, 5)}, Inglês {rng.randint(2, 5)}, Ciências Naturais {rng.randint(2, 5)}, História {rng.randint(2, 5)}.",
        f"Faltas injustificadas: {rng.randint(0, 6)}. Apoio tutorial às {rng.choice(['segundas', 'quartas', 'quintas'])}.",
        f"Saúde: {rng.choice(['asma, usa inalador na escola', 'alergia a amendoim', 'sem problemas de saúde conhecidos', 'diabetes tipo 1, insulina ao almoço'])}.",
        f"Observações: {pronoun(student)} alun{pronoun(student)} participa no clube de {rng.choice(['robótica', 'teatro', 'xadrez', 'jornalismo'])} (sala n.º {rng.randint(2, 30)}).",
    ]


def t_boletim_matricula(rng, student: Person) -> list[str]:
    parent, _ = relative(rng, student)
    parent.sex = rng.choice("FM")
    relation = "Mãe" if parent.sex == "F" else "Pai"
    year = rng.choice([1, 2, 3])
    course = rng.choice(["Engenharia Informática", "Gestão", "Enfermagem",
                         "Design de Comunicação", "Direito", "Turismo"])
    return [
        f"{rng.choice(['Instituto Politécnico do Tâmega', 'Universidade Lusitana do Norte'])}",
        "BOLETIM DE MATRÍCULA - Ano letivo 2026/2027",
        f"Curso: Licenciatura em {course}, {year}.º ano",
        "",
        "ESTUDANTE",
        f"N.º de estudante: {S('a' + str(2027 - year) + rand_digits(rng, 5))}",
        f"Nome completo: {S(student.name)}",
        f"Data de nascimento: {S(fmt_date(student.dob, 'iso'))}",
        f"Cartão de Cidadão: {S(fmt_cc(rng, student.cc))}",
        f"NIF: {S(student.nif)}",
        f"Morada em tempo de aulas: {S(student.address.full)}",
        f"Telemóvel: {S(fmt_phone(rng, student.mobile))}",
        f"Email institucional: {S('a' + str(2027 - year) + rand_digits(rng, 5) + '@alunos.exemplo.pt')}",
        f"Email pessoal: {S(student.email)}",
        f"Escola de origem: {S(rng.choice(SCHOOLS))}",
        "",
        "PROPINAS",
        f"Valor anual: {fmt_amount(697)} EUR, em {rng.choice([1, 7, 10])} prestações",
        f"Débito direto na conta com o IBAN {S(fmt_iban(rng, student.iban))}",
        f"Bolsa de ação social: {rng.choice(['requerida', 'não requerida', 'atribuída (escalão 2)'])}",
        "",
        "ENCARREGADO DE EDUCAÇÃO / CONTACTO DE EMERGÊNCIA",
        f"{relation}: {S(parent.name)}, {S(fmt_phone(rng, parent.mobile))}, {S(parent.email)}",
        "",
        "OUTROS DADOS",
        f"Necessidades educativas: {rng.choice(['nenhuma', 'dislexia (relatório anexo)', 'mobilidade reduzida'])}",
        f"Seguro escolar: incluído na matrícula (apólice de grupo n.º {rand_digits(rng, 8)})",
        f"Acesso à plataforma: utilizador {S(student.username)}, palavra-passe inicial {S('Esc' + rand_digits(rng, 4) + '!')} (alterar no primeiro acesso)",
        "",
        f"Data: {fmt_date(rand_date(rng, date(2026, 9, 1), date(2026, 9, 30)))}   Assinatura: {S(student.initials)}",
    ]


def t_pedido_portabilidade(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 5, 1), date(2026, 10, 1))
    return [
        f"{TELCO}",
        "PEDIDO DE PORTABILIDADE DE NÚMERO",
        f"Data do pedido: {fmt_date(day)}    Referência: PORT-{rand_digits(rng, 8)}",
        "",
        "1. Número(s) a portar",
        f"Número principal: {S(fmt_phone(rng, p.mobile))}",
        f"Operador atual: {rng.choice(['MEO', 'NOS', 'Vodafone', 'NOWO'])}",
        f"Tipo de contrato atual: {rng.choice(['pré-pago', 'pós-pago com fidelização até ' + fmt_date(day + timedelta(days=200))])}",
        "",
        "2. Titular",
        f"Nome: {S(p.name)}",
        f"NIF: {S(fmt_nif(rng, p.nif))}",
        f"Documento de identificação: Cartão de Cidadão {S(fmt_cc(rng, p.cc))}",
        f"Data de nascimento: {S(fmt_date(p.dob))}",
        f"Morada: {S(p.address.full)}",
        f"Email: {S(p.email)}",
        f"Contacto alternativo: {S(fmt_phone(rng, p.landline))}",
        "",
        "3. Novo serviço",
        f"Tarifário: {rng.choice(['Móvel 20GB', 'Móvel 50GB'])}, cartão SIM n.º {rand_digits(rng, 19, '89')}",
        f"Data pretendida para a portabilidade: {fmt_date(day + timedelta(days=rng.randint(3, 10)))}",
        f"Pagamento: débito direto, IBAN {S(fmt_iban(rng, p.iban))}",
        "",
        "4. Declaração",
        "Declaro que sou titular do número indicado e autorizo a Lusofibra a tratar o pedido de portabilidade junto do operador atual, nos termos do Regulamento da Portabilidade.",
        f"Assinatura: {S(p.initials)}",
        "",
        f"Preenchido na loja por: {S(make_person(rng).short)} (código de loja {rng.randint(100, 999)})",
    ]


def t_consentimento_rgpd(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 1, 10), date(2026, 10, 1))
    family_doctor = make_person(rng)
    return [
        f"{HOSPITAL}",
        "CONSENTIMENTO INFORMADO PARA TRATAMENTO DE DADOS PESSOAIS",
        "",
        f"Eu, {S(p.name)}, nascid{pronoun(p)} em {S(fmt_date(p.dob))}, utente n.º {S(p.sns)}, com o Cartão de Cidadão n.º {S(fmt_cc(rng, p.cc))} e NIF {S(fmt_nif(rng, p.nif))}, residente na {S(p.address.full)}, declaro que fui informad{pronoun(p)} sobre:",
        "",
        "a) A finalidade do tratamento: prestação de cuidados de saúde, faturação e envio de lembretes de consulta.",
        "b) O responsável pelo tratamento: o Hospital, através do seu Encarregado de Proteção de Dados, contactável em dpo@hsluzia-exemplo.pt.",
        f"c) O prazo de conservação: {rng.choice([5, 10, 20])} anos após o último contacto clínico.",
        "d) Os meus direitos de acesso, retificação, apagamento, limitação, portabilidade e oposição.",
        "",
        "Autorizo (assinalar):",
        f"[{'X' if rng.random() < 0.8 else ' '}] O envio de lembretes por SMS para o número {S(fmt_phone(rng, p.mobile))}.",
        f"[{'X' if rng.random() < 0.6 else ' '}] O envio de resultados de exames por email para {S(p.email)}.",
        f"[{'X' if rng.random() < 0.4 else ' '}] A partilha do meu processo clínico com o meu médico de família, {family_doctor.dr} {S(family_doctor.short)}, do Centro de Saúde de {rng.choice(PLACES)[0]}.",
        f"[{'X' if rng.random() < 0.3 else ' '}] A utilização de dados anonimizados para investigação.",
        "",
        f"Dados clínicos relevantes que autorizo registar: {rng.choice(CONDITIONS)}; alergia a {rng.choice(ALLERGIES)}; grupo sanguíneo {rng.choice(['A+', 'O+', 'B+', 'AB-'])}.",
        "",
        f"{p.address.locality}, {fmt_date(day, 'long')}",
        f"Assinatura d{pronoun(p)} utente: {S(p.initials)}",
        f"Testemunha (profissional de saúde): {S(make_person(rng).name)}, n.º mecanográfico {S(rand_digits(rng, 5))}",
    ]


def t_inscricao_ginasio(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 1, 5), date(2026, 10, 1))
    other, relation = relative(rng, p)
    card = make_card(rng)
    return [
        f"GINÁSIO {rng.choice(['CORPO ATIVO', 'FORMA & VIDA', 'ENERGIA TOTAL'])} - {rng.choice(PLACES)[0].upper()}",
        "FICHA DE INSCRIÇÃO DE SÓCIO",
        "",
        f"N.º de sócio: {S(rand_digits(rng, 5, '1'))}        Data de inscrição: {fmt_date(day)}",
        f"Nome: {S(p.name)}",
        f"Data de nascimento: {S(fmt_date(p.dob, 'dots'))}        Sexo: {'Feminino' if p.sex == 'F' else 'Masculino'}",
        f"NIF: {S(fmt_nif(rng, p.nif))}",
        f"Morada: {S(p.address.full)}",
        f"Telemóvel: {S(fmt_phone(rng, p.mobile))}        Email: {S(p.email)}",
        f"Profissão: {p.profession}",
        "",
        "PLANO",
        f"Modalidade: {rng.choice(['Livre trânsito', 'Aulas de grupo', 'Musculação + piscina'])}, {fmt_amount(rng.choice([29.9, 34.9, 44.9]))} EUR/mês",
        f"Pagamento: cartão {S(group4(card))}, validade {S(f'{rng.randint(1, 12):02d}/{rng.randint(27, 31)}')}, CVV {S(rand_digits(rng, 3))}",
        f"PIN de acesso ao torniquete: {S(rand_digits(rng, 4))}",
        "",
        "QUESTIONÁRIO DE SAÚDE (PAR-Q)",
        f"Problemas cardíacos: {rng.choice(['Não', 'Sim, sopro ligeiro'])}. Tensão alta: {rng.choice(['Não', 'Sim, medicada'])}. Lesões: {rng.choice(['nenhuma', 'ombro direito (2024)', 'menisco esquerdo operado'])}.",
        f"Medicação habitual: {rng.choice(MEDICATIONS + ['nenhuma'])}.",
        f"Objetivo: {rng.choice(['perder peso', 'ganhar massa muscular', 'reabilitação', 'manter a forma'])}. Peso atual: {rng.randint(52, 105)} kg.",
        "",
        f"Contacto de emergência: {S(other.name)} ({relation}) - {S(fmt_phone(rng, other.mobile))}",
        "",
        "Declaro que as informações são verdadeiras e aceito o regulamento interno.",
        f"Assinatura: {S(p.initials)}    Rececionista: {S(make_person(rng).first)}",
    ]


def t_registo_acessos_ti(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 6, 1), date(2026, 10, 5))
    admin = make_person(rng)
    users = [p, make_person(rng), make_person(rng)]
    ip = f"{rng.randint(2, 223)}.{rng.randint(0, 255)}.{rng.randint(0, 255)}.{rng.randint(1, 254)}"
    lan = f"10.{rng.randint(0, 20)}.{rng.randint(0, 255)}.{rng.randint(2, 254)}"
    lines = [
        f"{TELCO} - Sistemas de Informação",
        f"REGISTO DE INCIDENTE DE SEGURANÇA N.º SEC-{day.year}-{rand_digits(rng, 4)}",
        f"Data: {fmt_date(day)}    Severidade: {rng.choice(['média', 'alta'])}    Estado: fechado",
        f"Analista: {S(admin.name)} ({S(admin.username + '@lusofibra.pt')})",
        "",
        "Resumo:",
        f"Foram detetadas {rng.randint(40, 300)} tentativas de autenticação falhadas na VPN entre as 02h10 e as 03h45, a partir do endereço IP {S(ip)}, contra as contas abaixo.",
        "",
        "Contas afetadas:",
    ]
    for u in users:
        lines.append(
            f"- Utilizador {S(u.username)} ({S(u.name)}, {rng.choice(DEPARTMENTS)}), último acesso legítimo em {fmt_date(day - timedelta(days=rng.randint(1, 5)))} a partir do IP {S(lan)}."
        )
        lan = f"10.{rng.randint(0, 20)}.{rng.randint(0, 255)}.{rng.randint(2, 254)}"
    lines += [
        "",
        "Ações tomadas:",
        f"1. Bloqueio do endereço {S(ip)} na firewall de perímetro.",
        f"2. Reposição das palavras-passe. Palavra-passe temporária enviada por SMS: {S('Tmp-' + rand_digits(rng, 6))} (expira em 24h).",
        f"3. Ativação obrigatória de MFA para as três contas. Código de recuperação d{pronoun(p)} {S(p.first)}: {S(rand_digits(rng, 4) + '-' + rand_digits(rng, 4) + '-' + rand_digits(rng, 4))}.",
        f"4. Contactad{pronoun(p)} {pronoun(p)} titular {S(p.short)} pelo telemóvel {S(fmt_phone(rng, p.mobile))}, que confirmou não ter sido {'ela' if p.sex == 'F' else 'ele'}.",
        "",
        "Lições aprendidas: limitar tentativas por IP a 5 por minuto; rever a política de palavras-passe (mínimo 14 caracteres).",
        f"Fechado por {S(admin.short)} em {fmt_date(day + timedelta(days=1))}.",
    ]
    return lines


def t_carta_referencia(rng, p: Person) -> list[str]:
    boss = make_person(rng)
    day = rand_date(rng, date(2026, 2, 1), date(2026, 9, 30))
    start = rand_date(rng, date(2018, 1, 1), date(2022, 12, 31))
    return [
        f"{S(p.employer)}",
        f"{S(make_address(rng).full)}",
        "",
        f"{fmt_date(day, 'long')}",
        "",
        "CARTA DE REFERÊNCIA",
        "",
        "A quem possa interessar,",
        "",
        f"Confirmo que {S(p.name)}, portador{'a' if p.sex == 'F' else ''} do NIF {S(fmt_nif(rng, p.nif))}, trabalhou nesta empresa como {p.profession.lower()} entre {fmt_date(start, 'long')} e {fmt_date(day - timedelta(days=30), 'long')}, sob a minha supervisão direta.",
        f"Durante este período, {S(p.first)} demonstrou rigor, autonomia e grande capacidade de trabalho em equipa. Liderou a implementação de {rng.choice(['um novo sistema de gestão de stocks', 'um programa de formação interna', 'um projeto de digitalização de processos'])} e foi promovid{pronoun(p)} em {rng.randint(start.year + 1, 2025)}.",
        f"{'A sua' if p.sex == 'F' else 'O seu'} vencimento à data de saída era de {S(fmt_amount(p.salary))} EUR brutos mensais, com avaliação de desempenho de {rng.choice(['Muito Bom', 'Excelente'])} nos últimos dois anos.",
        f"A saída deu-se por iniciativa própria, para prosseguir estudos em {S(rng.choice(SCHOOLS))}.",
        "",
        f"Recomendo {S(p.first)} sem reservas e estou disponível para prestar mais informações pelo telefone {S(fmt_phone(rng, boss.mobile))} ou pelo email {S(boss.username + '@empresa-exemplo.pt')}.",
        "",
        "Com os melhores cumprimentos,",
        "",
        f"{S(boss.name)}",
        f"Diretor{'a' if boss.sex == 'F' else ''} de {rng.choice(DEPARTMENTS)}",
    ]


def t_auto_ocorrencia(rng, p: Person) -> list[str]:
    other = make_person(rng)
    witness = make_person(rng)
    day = rand_date(rng, date(2026, 3, 1), date(2026, 10, 1))
    place = make_address(rng)
    return [
        f"{INSURER}",
        "PARTICIPAÇÃO DE SINISTRO AUTOMÓVEL",
        f"Processo n.º {day.year}/{rand_digits(rng, 6)}    Data da participação: {fmt_date(day + timedelta(days=1))}",
        "",
        "1. SEGURADO",
        f"Nome: {S(p.name)}",
        f"Apólice n.º {S('AUT-' + rand_digits(rng, 9))}",
        f"NIF: {S(fmt_nif(rng, p.nif))}    Data de nascimento: {S(fmt_date(p.dob))}",
        f"Carta de condução n.º {S(rng.choice(['L', 'P', 'C', 'F']) + '-' + rand_digits(rng, 7) + ' ' + rng.choice('0123456789'))}",
        f"Morada: {S(p.address.full)}",
        f"Contactos: {S(fmt_phone(rng, p.mobile))} / {S(p.email)}",
        "",
        "2. OCORRÊNCIA",
        f"Data e hora: {fmt_date(day)}, {rng.randint(7, 22)}h{rng.randint(0, 59):02d}",
        f"Local: {S(place.street + ', junto ao n.º ' + place.number)}, {S(place.postal_line)}",
        f"Condições: {rng.choice(['chuva, piso molhado', 'bom tempo, piso seco', 'noite, boa iluminação'])}",
        f"Descrição: o veículo segurado seguia na via da direita quando o veículo terceiro, ao mudar de faixa sem sinalizar, embateu na lateral esquerda. Danos no para-choques, na porta do condutor e no retrovisor. Sem feridos. {rng.choice(['Não houve intervenção policial.', 'Elaborada declaração amigável.'])}",
        "",
        "3. TERCEIRO",
        f"Condutor: {S(other.name)}, {other.age} anos",
        f"Seguradora: {rng.choice(['Fidelidade', 'Ageas', 'Allianz', 'Tranquilidade'])}, apólice {S(rand_digits(rng, 10))}",
        f"Contacto: {S(fmt_phone(rng, other.mobile))}",
        f"Morada: {S(other.address.full)}",
        "",
        "4. TESTEMUNHA",
        f"{S(witness.name)}, {witness.profession.lower()}, telefone {S(fmt_phone(rng, witness.mobile))}. Estava na paragem de autocarro em frente e viu o embate.",
        "",
        f"5. REPARAÇÃO: oficina {rng.choice(['Auto Reparadora do Centro', 'Carroçarias Lima & Irmão'])}; orçamento de {fmt_amount(rng.uniform(900, 3400))} EUR. Franquia: {fmt_amount(rng.choice([150, 250, 350]))} EUR, a debitar no IBAN {S(fmt_iban(rng, p.iban))}.",
        "",
        f"Assinatura do segurado: {S(p.initials)}    Gestor de sinistro: {S(make_person(rng).short)}",
    ]


def t_relatorio_estagio(rng, student: Person) -> list[str]:
    supervisor = make_person(rng)
    tutor = make_person(rng)
    company = rng.choice(EMPLOYERS)
    course = rng.choice(["Técnico de Informática de Gestão", "Técnico de Apoio à Gestão Desportiva", "Técnico de Restauração", "Técnico de Eletrónica e Telecomunicações"])
    return [
        f"{SCHOOL}",
        "RELATÓRIO DE AVALIAÇÃO DA FORMAÇÃO EM CONTEXTO DE TRABALHO",
        f"Curso Profissional de {course} - Ano letivo 2025/2026",
        "",
        f"Aluno: {S(student.name)}, n.º {S(rand_digits(rng, 5, '12'))}, turma {rng.choice(['3.º TIG', '3.º TAGD', '3.º TR', '3.º TET'])}",
        f"Data de nascimento: {S(fmt_date(student.dob))}    NIF: {S(fmt_nif(rng, student.nif))}",
        f"Contacto do aluno: {S(fmt_phone(rng, student.mobile))}, {S(student.email)}",
        f"Entidade de acolhimento: {S(company)}",
        f"Tutor na entidade: {S(tutor.name)}, {tutor.profession.lower()}, {S(fmt_phone(rng, tutor.mobile))}",
        f"Professor{'a' if supervisor.sex == 'F' else ''} orientador{'a' if supervisor.sex == 'F' else ''}: {S(supervisor.name)}",
        f"Período: {fmt_date(date(2026, 3, 2))} a {fmt_date(date(2026, 6, 12))}, {rng.randint(380, 420)} horas",
        "",
        "1. Atividades desenvolvidas",
        f"- Apoio ao departamento de {rng.choice(DEPARTMENTS)}: registo de pedidos, atendimento e organização de arquivo.",
        f"- Participação no projeto de {rng.choice(['inventário anual', 'migração para a nova plataforma', 'abertura da loja de verão'])}.",
        "- Elaboração de um manual de procedimentos para novos estagiários.",
        "",
        "2. Avaliação do tutor",
        f"Assiduidade: {rng.randint(15, 20)}/20. Responsabilidade: {rng.randint(14, 20)}/20. Qualidade do trabalho: {rng.randint(14, 20)}/20. Relação interpessoal: {rng.randint(15, 20)}/20.",
        f"Comentário: {pronoun(student)} {S(student.first)} integrou-se rapidamente na equipa e mostrou iniciativa. Recomendamos a sua contratação futura.",
        "",
        "3. Classificação final",
        f"Nota da FCT: {rng.randint(14, 19)} valores. O aluno tem {student.age} anos e pretende candidatar-se ao ensino superior em {rng.choice(['Informática', 'Gestão', 'Desporto', 'Hotelaria'])}.",
        "",
        f"{rng.choice(PLACES)[0]}, {fmt_date(date(2026, 6, 20), 'long')}",
        f"O tutor: {S(tutor.initials)}    {'A' if supervisor.sex == 'F' else 'O'} professor{'a' if supervisor.sex == 'F' else ''} orientador{'a' if supervisor.sex == 'F' else ''}: {S(supervisor.initials)}    O aluno: {S(student.initials)}",
    ]


def t_pedido_acesso_dados(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 4, 1), date(2026, 10, 1))
    return [
        f"Para: Encarregado de Proteção de Dados, {TELCO}",
        f"De: {S(p.name)} ({S(p.email)})",
        f"Data: {fmt_date(day, 'long')}",
        "Assunto: Exercício do direito de acesso (artigo 15.º do RGPD)",
        "",
        "Exmos. Senhores,",
        "",
        f"Na qualidade de titular dos dados, cliente com o NIF {S(fmt_nif(rng, p.nif))}, venho exercer o meu direito de acesso e solicitar:",
        "1. Confirmação de que tratam dados pessoais que me dizem respeito;",
        "2. Cópia de todos esses dados, incluindo gravações de chamadas e registos de navegação associados ao meu contrato;",
        "3. A indicação das finalidades, dos destinatários e do prazo de conservação;",
        "4. A origem dos dados que não forneci diretamente.",
        "",
        f"Para me identificar, junto cópia do Cartão de Cidadão n.º {S(fmt_cc(rng, p.cc))}, válido, e indico a morada de faturação {S(p.address.full)}, e o número de telefone associado ao contrato, {S(fmt_phone(rng, p.landline))}.",
        f"Peço que a resposta seja enviada em formato eletrónico para o email acima ou, em alternativa, por correio para a morada indicada. Em caso de dúvida podem ligar-me para o {S(fmt_phone(rng, p.mobile))}.",
        "",
        "Recordo que o prazo de resposta é de um mês, prorrogável por mais dois em casos complexos, e que o pedido é gratuito.",
        "",
        "Com os melhores cumprimentos,",
        f"{S(p.name)}",
        f"Data de nascimento: {S(fmt_date(p.dob))} (para verificação de identidade)",
    ]


def t_fatura(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 1, 5), date(2026, 9, 30))
    plan = rng.choice(PLANS)
    base = PRICES[plan]
    extra = rng.choice([0, 2.5, 7.99, 15.0])
    total = base + extra
    return [
        f"{TELCO}",
        "Avenida da Liberdade, 210, 1250-147 Lisboa | NIPC 509 999 990 | Capital social 50.000.000 EUR",
        "",
        f"FATURA N.º FT{day.year}/{rand_digits(rng, 5)}    Data: {fmt_date(day)}    Vencimento: {fmt_date(day + timedelta(days=20))}",
        f"Contrato n.º LF-{rng.randint(2019, 2026)}-{rand_digits(rng, 7)}    Período: {fmt_date(day.replace(day=1))} a {fmt_date(day.replace(day=28))}",
        "",
        "Cliente:",
        f"{S(p.name)}",
        f"{S(p.address.street_line)}",
        f"{S(p.address.postal_line)}",
        f"NIF: {S(fmt_nif(rng, p.nif))}",
        "",
        "Descrição                                   Qtd.    Valor s/IVA    IVA     Total",
        f"{plan:<40}  1       {fmt_amount(base / 1.23):>10}   23%   {fmt_amount(base):>8}",
        f"{'Chamadas fora do plano':<40}  {rng.randint(1, 30):<7} {fmt_amount(extra / 1.23):>10}   23%   {fmt_amount(extra):>8}",
        f"{'Desconto de fidelização':<40}  1       {fmt_amount(-5 / 1.23):>10}   23%   {fmt_amount(-5):>8}",
        "",
        f"TOTAL A PAGAR: {fmt_amount(total - 5)} EUR",
        "",
        f"Pagamento por débito direto na conta {S(fmt_iban(rng, p.iban))} em {fmt_date(day + timedelta(days=20))}.",
        f"Referência Multibanco alternativa: entidade 21 312, referência {rand_digits(rng, 3)} {rand_digits(rng, 3)} {rand_digits(rng, 3)}, valor {fmt_amount(total - 5)} EUR.",
        "",
        f"Consumos do número {S(fmt_phone(rng, p.mobile))}: {rng.randint(2, 40)} GB de dados, {rng.randint(10, 400)} min de voz, {rng.randint(0, 80)} SMS.",
        f"Linha de apoio: 16 200 (dias úteis, 8h-22h). Área de cliente: utilizador {S(p.username)}.",
        "Processado por programa certificado n.º 1234/AT. Este documento não serve de recibo.",
    ]


def t_candidatura(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 5, 1), date(2026, 10, 1))
    previous = rng.sample(EMPLOYERS, 2)
    ref = make_person(rng)
    return [
        f"{TELCO} - Recrutamento",
        f"FORMULÁRIO DE CANDIDATURA - Ref. {rng.choice(['REC-2026-TEC-014', 'REC-2026-APC-031', 'REC-2026-FIN-007'])}",
        f"Data de receção: {fmt_date(day)}",
        "",
        "DADOS PESSOAIS",
        f"Nome: {S(p.name)}",
        f"Data de nascimento: {S(fmt_date(p.dob))}    Nacionalidade: Portuguesa",
        f"Morada: {S(p.address.full)}",
        f"Telemóvel: {S(fmt_phone(rng, p.mobile))}    Email: {S(p.email)}",
        f"LinkedIn: {S('linkedin.com/in/' + strip_accents(p.first).lower() + '-' + strip_accents(p.last).lower() + '-' + rand_digits(rng, 4))}",
        f"NIF: {S(fmt_nif(rng, p.nif))}    Carta de condução: {rng.choice(['Sim, categoria B', 'Não'])}",
        "",
        "FORMAÇÃO",
        f"{rng.choice(['Licenciatura em Gestão', 'Mestrado em Engenharia Eletrotécnica', 'Curso profissional de Técnico de Telecomunicações', 'Licenciatura em Comunicação'])}, {S(rng.choice(SCHOOLS))}, concluído em {rng.randint(2008, 2024)}.",
        f"Formação complementar: {rng.choice(['Certificação CCNA', 'Curso de Excel avançado', 'Formação em atendimento ao cliente (35h)'])}.",
        "",
        "EXPERIÊNCIA PROFISSIONAL",
        f"{rng.randint(2019, 2023)}-2026: {p.profession} em {S(previous[0])}. Vencimento atual: {S(fmt_amount(p.salary))} EUR brutos.",
        f"{rng.randint(2012, 2018)}-{rng.randint(2019, 2022)}: {rng.choice(JOB_TITLES)} em {S(previous[1])}.",
        "",
        "LÍNGUAS E COMPETÊNCIAS",
        f"Português (nativo), Inglês ({rng.choice(['B2', 'C1'])}), Espanhol ({rng.choice(['A2', 'B1'])}). Excel, SAP, Salesforce.",
        "",
        "REFERÊNCIA",
        f"{S(ref.name)}, {rng.choice(['chefe de equipa', 'diretor de loja', 'coordenador de turno'])} em {S(previous[0])}, {S(fmt_phone(rng, ref.mobile))}.",
        "",
        "OUTRAS INFORMAÇÕES",
        f"Disponibilidade: {rng.choice(['imediata', '30 dias', 'a partir de ' + fmt_date(day + timedelta(days=45))])}. Pretensão salarial: {S(fmt_amount(p.salary + 200))} EUR brutos.",
        f"Estado civil: {rng.choice(['solteiro(a)', 'casado(a)'])}. {rng.choice(['Sem filhos.', '1 filho.', '2 filhos.'])} {rng.choice(['Sem restrições de horário.', 'Prefere horário diurno.'])}",
        "",
        f"Autorizo o tratamento destes dados para efeitos de recrutamento por 12 meses. Assinatura: {S(p.initials)}",
    ]


def t_lista_presencas(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 2, 1), date(2026, 9, 30))
    trainer = make_person(rng)
    people = [p] + [make_person(rng) for _ in range(rng.randint(7, 11))]
    lines = [
        f"{TELCO} - Academia Interna",
        f"FOLHA DE PRESENÇAS - Ação de formação \"{rng.choice(['Segurança no trabalho em altura', 'Proteção de dados para operadores', 'Atendimento telefónico avançado'])}\"",
        f"Data: {fmt_date(day)}    Horário: 09h00-13h00    Sala: {rng.randint(1, 8)}    Formador{'a' if trainer.sex == 'F' else ''}: {S(trainer.name)}",
        "",
        "N.º   N.º mec.   Nome                                Departamento            Assinatura",
    ]
    for i, person in enumerate(people, 1):
        lines.append(
            f"{i:<5} {S(rand_digits(rng, 6, '1')):<10} {S(person.name):<35} {rng.choice(DEPARTMENTS):<23} {S(person.first[0] + '. ' + person.last)}"
        )
    lines += [
        "",
        f"Total de presenças: {len(people)}. Faltas: {rng.randint(0, 2)}.",
        f"Observações: {pronoun(people[1])} formand{pronoun(people[1])} {S(people[1].short)} saiu às 12h15 por motivo de consulta médica.",
        f"O formador declara que a ação decorreu conforme o plano. Contacto: {S(trainer.username + '@formacao-exemplo.pt')}",
    ]
    return lines


def t_ficha_veterinaria(rng, p: Person) -> list[str]:
    vet = make_person(rng)
    day = rand_date(rng, date(2026, 1, 10), date(2026, 10, 1))
    pet = rng.choice(["Bolinhas", "Tico", "Luna", "Farrusco", "Nina", "Max"])
    return [
        f"CLÍNICA VETERINÁRIA {rng.choice(['QUATRO PATAS', 'DO PARQUE', 'SÃO FRANCISCO'])}",
        "FICHA CLÍNICA DO ANIMAL",
        "",
        f"Animal: {pet}, {rng.choice(['cão, Labrador', 'gato europeu comum', 'cão, Podengo', 'gata persa'])}, {rng.randint(1, 14)} anos, {rng.randint(3, 38)} kg",
        f"Microchip n.º {rand_digits(rng, 15, '9')}    Registo SIAC: ativo",
        "",
        "TUTOR",
        f"Nome: {S(p.name)}",
        f"NIF: {S(fmt_nif(rng, p.nif))}",
        f"Morada: {S(p.address.full)}",
        f"Telemóvel: {S(fmt_phone(rng, p.mobile))}    Email: {S(p.email)}",
        f"Pessoa autorizada a levantar o animal: {S(relative(rng, p)[0].name)}",
        "",
        f"CONSULTA DE {fmt_date(day)}",
        f"Motivo: {rng.choice(['vacinação anual', 'vómitos há dois dias', 'claudicação da pata posterior esquerda', 'limpeza dentária'])}.",
        f"Exame: temperatura {rng.randint(37, 39)},{rng.randint(0, 9)} ºC, mucosas rosadas, auscultação normal.",
        f"Tratamento: {rng.choice(['vacina polivalente + desparasitação', 'maropitant 1 mg/kg SC, dieta gastrointestinal 5 dias', 'meloxicam 0,1 mg/kg 5 dias, repouso', 'profilaxia dentária sob anestesia'])}.",
        f"Próxima consulta: {fmt_date(day + timedelta(days=rng.choice([14, 30, 365])))}.",
        "",
        f"Valor: {fmt_amount(rng.uniform(35, 180))} EUR. Pago por MB WAY do número {S(fmt_phone(rng, p.mobile))}.",
        f"Médic{pronoun(vet)} veterinári{pronoun(vet)}: {vet.dr} {S(vet.name)}, OMV n.º {S(rand_digits(rng, 4, '12'))}",
    ]


def t_ficha_paciente(rng, p: Person) -> list[str]:
    """Styled digits and a struck-through old number, in a hospital record."""
    doctor = make_person(rng)
    day = rand_date(rng, date(2026, 5, 1), date(2026, 10, 1))
    old_phone = fmt_phone(rng, make_mobile(rng))
    other, relation = relative(rng, p)
    return [
        f"{HOSPITAL} - Consulta Externa",
        f"FICHA DO PACIENTE    Ref. CE-{day.year}-{rand_digits(rng, 6)}",
        "",
        f"Nome: {S(p.name)}",
        f"Data de nascimento: {S(fmt_date(p.dob))} ({p.age} anos)    Sexo: {'F' if p.sex == 'F' else 'M'}",
        f"N.º utente: {S(styled_digits(p.sns))}",
        f"NIF: {S(fmt_nif(rng, p.nif))}    Cartão de Cidadão: {S(fmt_cc(rng, p.cc))}",
        f"Morada: {S(p.address.full)}",
        f"Telemóvel: {S(struck(old_phone))} {S(fmt_phone(rng, p.mobile))} (atualizado em {fmt_date(day)})",
        f"Email: {S(p.email)}",
        f"Pessoa de contacto: {S(other.name)} ({relation}), {S(styled_digits(fmt_phone(rng, other.mobile)))}",
        f"Seguro: {rng.choice(['Multicare', 'Médis', 'AdvanceCare'])}, apólice n.º {S(rand_digits(rng, 9))}",
        "",
        "ANTECEDENTES",
        f"{rng.choice(CONDITIONS).capitalize()}; {rng.choice(CONDITIONS)}. Cirurgia de {rng.choice(['apendicectomia', 'colecistectomia', 'hérnia inguinal'])} em {rng.randint(2005, 2023)}.",
        f"Hábitos: {rng.choice(['não fumador', 'ex-fumador (parou há 4 anos)', 'fumador, 10 cigarros/dia'])}; álcool {rng.choice(['ocasional', 'nunca', 'diário, 2 copos de vinho'])}.",
        f"Medicação: {rng.choice(MEDICATIONS)}; {rng.choice(MEDICATIONS)}.",
        f"Alergias: {rng.choice(ALLERGIES)}.",
        f"Profissão: {p.profession.lower()}, em {S(p.employer)}; {rng.choice(['trabalho por turnos', 'trabalho sentado', 'esforço físico diário'])}.",
        "",
        f"CONSULTA DE {fmt_date(day)}",
        f"Queixa: {rng.choice(['dor lombar há 3 semanas', 'tosse persistente', 'cefaleias frequentes', 'cansaço e tonturas'])}. Exame objetivo sem alterações relevantes.",
        f"Plano: {rng.choice(['RX da coluna lombar', 'análises e RX do tórax', 'TAC crânio-encefálica', 'ECG e análises'])}; reavaliação em {rng.randint(2, 8)} semanas.",
        "",
        f"{doctor.dr} {S(doctor.name)}, n.º de cédula {S(rand_digits(rng, 5, '3456'))}, ext. {rng.randint(3000, 3999)}",
    ]


def t_tarifa_social(rng, p: Person) -> list[str]:
    day = rand_date(rng, date(2026, 2, 1), date(2026, 9, 30))
    spouse = make_person(rng)
    spouse.last = p.last
    return [
        "REQUERIMENTO DE TARIFA SOCIAL DE INTERNET",
        "",
        "Identificação do requerente",
        f"Nome: {S(p.name)}",
        f"Data de nascimento: {S(fmt_date(p.dob))}",
        f"NIF: {S(p.nif)}",
        f"NISS: {S(p.niss)}",
        f"Cartão de Cidadão: {S(fmt_cc(rng, p.cc))}",
        f"Morada: {S(p.address.full)}",
        f"Telefone: {S(fmt_phone(rng, p.landline))}",
        f"Email: {S(p.email) if rng.random() < 0.6 else '(não tem)'}",
        "",
        "Fundamento do pedido (assinalar)",
        f"[{'X' if rng.random() < 0.5 else ' '}] Beneficiário do complemento solidário para idosos",
        f"[{'X' if rng.random() < 0.5 else ' '}] Beneficiário do rendimento social de inserção",
        f"[{'X' if rng.random() < 0.5 else ' '}] Pensão social de invalidez (incapacidade de {rng.randint(60, 90)}%, atestado multiuso n.º {S('AM-' + str(rng.randint(2019, 2025)) + '-' + rand_digits(rng, 6))})",
        f"[{'X' if rng.random() < 0.5 else ' '}] Rendimento do agregado inferior a {fmt_amount(rng.choice([5808, 7000, 8500]))} EUR anuais: rendimento declarado de {S(fmt_amount(rng.uniform(3000, 8400)))} EUR",
        "",
        "Agregado familiar",
        f"1. {S(p.name)} (requerente)",
        f"2. {S(spouse.name)}, cônjuge, NIF {S(fmt_nif(rng, spouse.nif))}",
        *([f"3. {S(make_person(rng, 3, 17).first + ' ' + p.last)}, filh{rng.choice('oa')}, {rng.randint(3, 17)} anos"] if rng.random() < 0.6 else []),
        "",
        "Declaro, sob compromisso de honra, que as informações prestadas são verdadeiras e autorizo a Lusofibra a confirmar junto da Segurança Social a minha condição de beneficiário.",
        "",
        f"Débito direto: IBAN {S(p.iban)}",
        "",
        f"{p.address.locality}, {fmt_date(day, 'long')}",
        f"Assinatura: {S(p.initials)}",
    ]


TEXT_TEMPLATES = [
    ("ficha_cliente", t_ficha_cliente), ("email_reclamacao", t_email_reclamacao),
    ("notas_chamada", t_notas_chamada), ("ficha_rh", t_ficha_rh),
    ("carta_rescisao", t_carta_rescisao), ("relatorio_tecnico", t_relatorio_tecnico),
    ("procuracao", t_procuracao), ("chat_apoio", t_chat_apoio),
    ("declaracao_medica", t_declaracao_medica), ("recibo_vencimento", t_recibo_vencimento),
    ("ata_condominio", t_ata_condominio), ("ficha_aluno", t_ficha_aluno),
    ("boletim_matricula", t_boletim_matricula), ("pedido_portabilidade", t_pedido_portabilidade),
    ("consentimento_rgpd", t_consentimento_rgpd), ("inscricao_ginasio", t_inscricao_ginasio),
    ("registo_acessos_ti", t_registo_acessos_ti), ("carta_referencia", t_carta_referencia),
    ("auto_ocorrencia", t_auto_ocorrencia), ("relatorio_estagio", t_relatorio_estagio),
    ("pedido_acesso_dados", t_pedido_acesso_dados), ("fatura", t_fatura),
    ("candidatura", t_candidatura), ("lista_presencas", t_lista_presencas),
    ("ficha_veterinaria", t_ficha_veterinaria), ("ficha_paciente", t_ficha_paciente),
    ("tarifa_social", t_tarifa_social),
]
# Templates about students: the person is 11-18 or 18-24 years old.
STUDENT_AGES = {"ficha_aluno": (10, 18), "relatorio_estagio": (16, 20),
                "boletim_matricula": (18, 26)}
# Templates whose text needs UTF-8 (styled letters).
UTF8_ONLY = {"ficha_paciente"}
# Templates rendered as PDF (a second instance, with another person).
PDF_TEMPLATES = ["ficha_cliente", "ficha_rh", "declaracao_medica", "procuracao",
                 "relatorio_tecnico", "fatura", "ficha_aluno", "auto_ocorrencia",
                 "recibo_vencimento", "carta_referencia"]
# (encoding, newline) for the text files, cycled in order.
ENCODINGS = [("utf-8", "\n"), ("utf-8", "\r\n"), ("utf-16", "\n"),
             ("cp1252", "\r\n"), ("utf-8-sig", "\n"), ("utf-8", "\n")]


# --------------------------------------------------------------------------
# CSV templates. Each returns (header, rows) where every cell is a string
# that may contain marked values, plus the delimiter and encoding to use.
# --------------------------------------------------------------------------

@dataclass
class CsvSpec:
    name: str
    header: list[str]
    rows: list[list[str]]
    delimiter: str = ","
    encoding: str = "utf-8"
    newline: str = "\n"
    quoting: int = csv.QUOTE_MINIMAL


def c_registos_clientes(rng, n, variant) -> CsvSpec:
    rows = []
    for i in range(n):
        p = make_person(rng)
        plan = rng.choice(PLANS)
        if variant == 0:
            rows.append([
                S(p.name), S(p.nif), S(fmt_date(p.dob, "iso")), p.sex,
                S(p.address.postal), S(p.address.locality), S(fmt_phone(rng, p.mobile)),
                S(p.email), S(group4(p.iban)), plan, f"{PRICES[plan]:.2f}",
                f"FT2026/{88200 + i}",
            ])
        else:
            rows.append([
                S(p.name), S(fmt_nif(rng, p.nif)), S(fmt_date(p.dob)),
                "Feminino" if p.sex == "F" else "Masculino",
                S(p.address.full), S(fmt_phone(rng, p.mobile)), S(p.email),
                S(p.iban), plan, fmt_amount(PRICES[plan]),
                rng.choice(["Ativo", "Ativo", "Suspenso", "Em cobrança"]),
            ])
    if variant == 0:
        return CsvSpec("registos_clientes", [
            "nome", "nif", "data_nasc", "sexo", "cod_postal", "localidade",
            "telemovel", "email", "iban", "plano", "mensalidade", "ultima_fatura",
        ], rows)
    return CsvSpec("clientes_export_excel", [
        "Nome completo", "NIF", "Data de nascimento", "Sexo", "Morada",
        "Telemóvel", "E-mail", "IBAN", "Tarifário", "Mensalidade", "Estado",
    ], rows, delimiter=";", encoding="cp1252", newline="\r\n")


def c_colaboradores(rng, n, variant) -> CsvSpec:
    rows = []
    for _ in range(n):
        p = make_person(rng, 20, 64)
        rows.append([
            S(rand_digits(rng, 6, "1")), S(p.name), rng.choice(JOB_TITLES),
            rng.choice(DEPARTMENTS),
            fmt_date(rand_date(rng, date(2010, 1, 1), date(2026, 9, 1))),
            S(p.nif), S(p.niss), S(group4(p.iban)), S(fmt_amount(p.salary)),
            S(p.username + "@lusofibra.pt"), S(fmt_phone(rng, p.mobile)),
            rng.choice(["Sem termo", "Termo certo", "Termo incerto"]),
        ])
    return CsvSpec("colaboradores_rh", [
        "n_mecanografico", "nome", "cargo", "departamento", "data_admissao",
        "nif", "niss", "iban", "vencimento_base", "email_profissional",
        "telemovel", "vinculo",
    ], rows, delimiter=";", encoding="utf-8-sig")


def c_consultas(rng, n, variant) -> CsvSpec:
    doctors = [make_person(rng) for _ in range(4)]
    rows = []
    for _ in range(n):
        p = make_person(rng, 1, 95)
        d = rng.choice(doctors)
        day = rand_date(rng, date(2026, 9, 1), date(2026, 9, 30))
        rows.append([
            fmt_date(day, "iso"), f"{rng.randint(8, 18):02d}:{rng.choice(['00', '20', '40'])}",
            S(p.sns), S(p.name), S(fmt_date(p.dob, "iso")),
            d.dr + " " + S(d.short), rng.choice(["Medicina Geral", "Cardiologia",
                                                 "Pediatria", "Dermatologia"]),
            rng.choice(CONDITIONS), rng.choice(MEDICATIONS),
            rng.choice(["realizada", "realizada", "faltou", "remarcada"]),
        ])
    return CsvSpec("consultas_setembro", [
        "data", "hora", "n_utente", "nome", "data_nasc", "medico",
        "especialidade", "diagnostico", "prescricao", "estado",
    ], rows)


def c_alunos_turma(rng, n, variant) -> CsvSpec:
    rows = []
    for i in range(n):
        s = make_person(rng, 12, 16)
        parent, _ = relative(rng, s)
        rows.append([
            S(rand_digits(rng, 5, "12")), str(i + 1), S(s.name),
            S(fmt_date(s.dob)), S(parent.name), S(fmt_phone(rng, parent.mobile)),
            S(parent.email), str(rng.randint(1, 5)), str(rng.randint(1, 5)),
            str(rng.randint(1, 5)), str(rng.randint(0, 12)),
            rng.choice(["", "", "ASE escalão A", "ASE escalão B", "NEE"]),
        ])
    return CsvSpec("alunos_turma_8B", [
        "n_aluno", "n_turma", "nome_aluno", "data_nascimento",
        "encarregado_educacao", "telemovel_ee", "email_ee", "portugues",
        "matematica", "ingles", "faltas", "observacoes_escola",
    ], rows, delimiter=";", encoding="utf-16", newline="\r\n")


def c_chamadas_apoio(rng, n, variant) -> CsvSpec:
    agents = [make_person(rng) for _ in range(5)]
    rows = []
    for _ in range(n):
        p = make_person(rng)
        day = rand_date(rng, date(2026, 10, 1), date(2026, 10, 3))
        rows.append([
            f"{fmt_date(day, 'iso')} {rng.randint(8, 21):02d}:{rng.randint(0, 59):02d}",
            str(rng.randint(45, 1500)), S(p.mobile), S(p.name),
            S(rng.choice(agents).short),
            rng.choice(["avaria", "fatura", "alteração de tarifário",
                        "cancelamento", "portabilidade", "equipamento"]),
            rng.choice(["sim", "sim", "não", "escalado"]),
        ])
    return CsvSpec("chamadas_apoio", [
        "data_hora", "duracao_s", "numero_origem", "nome_cliente", "agente",
        "motivo", "resolvido",
    ], rows, delimiter="\t")


def c_faturas(rng, n, variant) -> CsvSpec:
    rows = []
    for i in range(n):
        p = make_person(rng)
        day = rand_date(rng, date(2026, 8, 1), date(2026, 8, 31))
        total = rng.choice(list(PRICES.values())) + rng.choice([0, 0, 4.5, 12])
        rows.append([
            f"FT2026/{90100 + i}", fmt_date(day), S(p.name), S(p.nif),
            S(p.address.full), f"{total:.2f}", f"{total - total / 1.23:.2f}",
            rng.choice(["paga", "paga", "pendente", "em atraso"]),
        ])
    return CsvSpec("faturas_agosto", [
        "n_fatura", "data", "cliente", "nif", "morada_faturacao", "total",
        "iva", "estado",
    ], rows, quoting=csv.QUOTE_ALL if variant else csv.QUOTE_MINIMAL)


def c_candidaturas(rng, n, variant) -> CsvSpec:
    rows = []
    for _ in range(n):
        p = make_person(rng, 20, 58)
        rows.append([
            S(p.name), S(p.email), S(fmt_phone(rng, p.mobile)), S(fmt_date(p.dob)),
            S(p.address.locality), S(p.employer), p.profession,
            str(rng.randint(0, 25)), rng.choice(JOB_TITLES),
            rng.choice(["", "entrevista marcada", "rejeitado", "proposta enviada"]),
            str(rng.randint(1, 5)),
        ])
    return CsvSpec("candidaturas_recrutamento", [
        "nome", "email", "telemovel", "data_nascimento", "localidade",
        "empregador_atual", "profissao", "anos_experiencia", "vaga", "estado",
        "classificacao",
    ], rows, delimiter="|")


def c_acessos(rng, n, variant) -> CsvSpec:
    rows = []
    for _ in range(n):
        p = make_person(rng, 20, 64)
        day = rand_date(rng, date(2026, 9, 20), date(2026, 10, 5))
        ip = f"{rng.randint(2, 223)}.{rng.randint(0, 255)}.{rng.randint(0, 255)}.{rng.randint(1, 254)}"
        rows.append([
            S(p.username), S(p.name), S(p.username + "@lusofibra.pt"),
            rng.choice(["operador", "operador", "supervisor", "admin", "leitura"]),
            f"{fmt_date(day, 'iso')}T{rng.randint(0, 23):02d}:{rng.randint(0, 59):02d}:00",
            S(ip), rng.choice(["ativo", "ativo", "bloqueado", "expirado"]),
            str(rng.randint(0, 6)),
        ])
    return CsvSpec("acessos_sistema", [
        "utilizador", "nome", "email", "perfil", "ultimo_login", "ip_origem",
        "estado", "tentativas_falhadas",
    ], rows)


def c_intervencoes(rng, n, variant) -> CsvSpec:
    techs = [make_person(rng) for _ in range(4)]
    rows = []
    for _ in range(n):
        p = make_person(rng)
        day = rand_date(rng, date(2026, 9, 1), date(2026, 9, 30))
        lat = round(rng.uniform(37.0, 41.8), 5)
        lon = round(rng.uniform(6.2, 9.5), 5)
        rows.append([
            f"OT-{rand_digits(rng, 9)}", fmt_date(day), S(rng.choice(techs).name),
            S(p.name), S(p.address.full), S(f"{lat} N, {lon} W"),
            rng.choice(["sem sinal ótico", "TV sem imagem", "velocidade baixa",
                        "router avariado", "cabo partido"]),
            rng.choice(["resolvido", "resolvido", "pendente de material",
                        "reagendado"]),
            str(rng.randint(30, 180)),
        ])
    return CsvSpec("intervencoes_tecnicas", [
        "ordem_trabalho", "data", "tecnico", "cliente", "morada", "gps",
        "avaria", "resolucao", "duracao_min",
    ], rows, delimiter=";")


def c_transferencias(rng, n, variant) -> CsvSpec:
    rows = []
    for _ in range(n):
        a, b = make_person(rng), make_person(rng)
        day = rand_date(rng, date(2026, 9, 1), date(2026, 9, 30))
        rows.append([
            fmt_date(day, "iso"), S(a.iban), S(a.name), S(b.iban), S(b.name),
            fmt_amount(rng.uniform(10, 2500)),
            rng.choice(["Renda", "Transferência", "Pagamento fatura",
                        "Prestação", "Mesada", "Reembolso"]),
            rng.choice(["executada", "executada", "pendente", "devolvida"]),
        ])
    return CsvSpec("transferencias_setembro", [
        "data", "iban_origem", "titular_origem", "iban_destino",
        "beneficiario", "montante", "descricao", "estado",
    ], rows)


def c_inscricoes_evento(rng, n, variant) -> CsvSpec:
    rows = []
    for _ in range(n):
        p = make_person(rng, 22, 65)
        rows.append([
            S(p.name), S(p.email), S(fmt_phone(rng, p.mobile)), S(p.employer),
            p.profession, rng.choice(["nenhuma", "vegetariano", "sem glúten",
                                      "vegan", "sem lactose"]),
            rng.choice(["Workshop A - Fibra", "Workshop B - 5G",
                        "Workshop C - Segurança"]),
            rng.choice(["sim", "não"]),
        ])
    return CsvSpec("inscricoes_evento", [
        "Nome", "E-mail", "Telefone", "Entidade", "Função",
        "Restrições alimentares", "Workshop", "Confirmado",
    ], rows, delimiter=";", encoding="cp1252", newline="\r\n")


def c_reclamacoes(rng, n, variant) -> CsvSpec:
    """Free text in a quoted cell, with line breaks and names inside."""
    rows = []
    for i in range(n):
        p = make_person(rng)
        agent = make_person(rng)
        neighbour = make_person(rng)
        day = rand_date(rng, date(2026, 9, 1), date(2026, 10, 3))
        text = rng.choice([
            f"Cliente {S(p.first)} refere que o técnico {S(agent.short)} não apareceu na hora marcada.\nPede novo agendamento e contacto para o {S(fmt_phone(rng, p.mobile))}.",
            f"Fatura com valor duplicado. {p.title} {S(p.last)} enviou comprovativo do IBAN {S(group4(p.iban))}.\nAguarda estorno.",
            f"Pedido de cancelamento por mudança de casa para {S(p.address.full)}.\nSem fidelização ativa.",
            f"Reclama da qualidade do sinal de TV. Vizinho {neighbour.title} {S(neighbour.last)} tem o mesmo problema.",
        ])
        rows.append([
            f"REC-2026-{3200 + i}", fmt_date(day), S(p.name), S(p.email),
            rng.choice(["telefone", "email", "loja", "livro de reclamações"]),
            text, rng.choice(["aberta", "em análise", "fechada"]),
        ])
    return CsvSpec("reclamacoes_com_notas", [
        "n_reclamacao", "data", "cliente", "contacto", "canal", "descricao",
        "estado",
    ], rows)


def c_vacinacao(rng, n, variant) -> CsvSpec:
    nurses = [make_person(rng) for _ in range(3)]
    rows = []
    for _ in range(n):
        p = make_person(rng, 1, 95)
        day = rand_date(rng, date(2026, 10, 1), date(2026, 10, 5))
        rows.append([
            S(p.sns), S(p.name), S(fmt_date(p.dob, "iso")),
            rng.choice(["Gripe sazonal", "COVID-19", "Tétano", "Pneumocócica"]),
            f"L{rand_digits(rng, 6)}", fmt_date(day, "iso"),
            S(rng.choice(nurses).short), rng.choice(["braço esquerdo",
                                                     "braço direito"]),
            rng.choice(["", "", "", "reação local ligeira"]),
        ])
    return CsvSpec("vacinacao_outubro", [
        "n_utente", "nome", "data_nasc", "vacina", "lote", "data_toma",
        "enfermeiro", "local_administracao", "reacoes",
    ], rows)


def c_propinas(rng, n, variant) -> CsvSpec:
    rows = []
    for _ in range(n):
        s = make_person(rng, 18, 26)
        rows.append([
            S("a" + rand_digits(rng, 7, "12")), S(s.name),
            rng.choice(["Gestão", "Informática", "Enfermagem", "Design"]),
            str(rng.randint(1, 3)), "69,70",
            rng.choice(["pago", "pago", "em atraso", "isento (bolsa)"]),
            S(s.email), S(fmt_phone(rng, s.mobile)),
        ])
    return CsvSpec("estudantes_propinas", [
        "n_estudante", "nome", "curso", "ano", "propina_mensal",
        "estado_pagamento", "email", "telemovel",
    ], rows, delimiter=";")


def c_agregados(rng, n, variant) -> CsvSpec:
    rows = []
    for _ in range(n):
        p = make_person(rng, 25, 80)
        members = [(p, "requerente")] + [
            (relative(rng, p)[0], rng.choice(["cônjuge", "filho/a", "pai/mãe"]))
            for _ in range(rng.randint(0, 3))
        ]
        for m, rel in members:
            rows.append([
                S(p.name), S(p.nif), S(m.name), rel, S(fmt_date(m.dob)),
                S(fmt_amount(rng.choice([0, 0, 480, 760, 1020, 1430]))),
                rng.choice(["", "", "incapacidade 60%", "estudante"]),
            ])
    return CsvSpec("agregados_tarifa_social", [
        "requerente", "nif_requerente", "membro", "relacao",
        "data_nascimento", "rendimento_mensal", "situacao",
    ], rows)


CSV_TEMPLATES = [
    (c_registos_clientes, 12, 0), (c_registos_clientes, 25, 1),
    (c_colaboradores, 18, 0), (c_consultas, 30, 0), (c_alunos_turma, 24, 0),
    (c_chamadas_apoio, 40, 0), (c_faturas, 15, 0), (c_faturas, 10, 1),
    (c_candidaturas, 14, 0), (c_acessos, 20, 0), (c_intervencoes, 16, 0),
    (c_transferencias, 22, 0), (c_inscricoes_evento, 18, 0),
    (c_reclamacoes, 9, 0), (c_vacinacao, 28, 0), (c_propinas, 20, 0),
    (c_agregados, 8, 0),
]


# --------------------------------------------------------------------------
# Markers -> document and reference answer
# --------------------------------------------------------------------------

_WS = re.compile(r"(\s+)")


def strip_markers(text: str) -> str:
    return text.replace(OPEN, "").replace(CLOSE, "")


def gold_line(marked: str) -> str:
    """The reference answer for one laid-out line: every word inside the
    markers becomes "*" (with its glued punctuation kept)."""
    out, inside = [], False
    for part in _WS.split(marked):
        if not part or part.isspace():
            out.append(part)
            continue
        if inside or OPEN in part or CLOSE in part:
            out.append(mask_token(strip_markers(part), keep_punct=True))
        else:
            out.append(part)
        if CLOSE in part:
            inside = False
        elif OPEN in part:
            inside = True
    return "".join(out)


def check_markers(lines: list[str]) -> None:
    """Every marker is balanced inside its line and attached to a word."""
    for line in lines:
        depth = 0
        for ch in line:
            if ch == OPEN:
                depth += 1
                assert depth == 1, f"nested marker in {line!r}"
            elif ch == CLOSE:
                depth -= 1
                assert depth == 0, f"stray close marker in {line!r}"
        assert depth == 0, f"unclosed marker in {line!r}"
        assert OPEN + " " not in line and " " + CLOSE not in line, line
        assert OPEN + CLOSE not in line, f"empty marker in {line!r}"


def write_text(path: Path, text: str, encoding: str, newline: str) -> None:
    data = text.replace("\n", newline).encode(encoding)
    path.write_bytes(data)


def write_gold(path: Path, lines: list[str]) -> None:
    path.with_name(f"{path.stem}.gold.txt").write_text(
        "\n".join(lines) + "\n", encoding="utf-8", newline="\n")


def make_text_doc(path: Path, marked_lines: list[str], encoding: str,
                  newline: str) -> list[str]:
    check_markers(marked_lines)
    marked_text = "\n".join(marked_lines) + "\n"
    write_text(path, strip_markers(marked_text), encoding, newline)
    marked_read = clean_lines(marked_text)
    read_back = read_document(path)
    assert [strip_markers(x) for x in marked_read] == read_back, path.name
    gold = [gold_line(x) for x in marked_read]
    write_gold(path, gold)
    return gold


PDF_FONT, PDF_SIZE, PDF_LEADING = "helv", 10, 14
PDF_MARGIN, PDF_WIDTH, PDF_HEIGHT = 48, 595, 842


def wrap_marked(line: str, max_width: float) -> list[str]:
    """Word-wrap a marked line by the rendered width of its plain text."""
    words = line.split()
    if not words:
        return [""]
    out, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and pymupdf.get_text_length(
                strip_markers(candidate), PDF_FONT, PDF_SIZE) > max_width:
            out.append(current)
            current = word
        else:
            current = candidate
    out.append(current)
    return out


def make_pdf_doc(path: Path, marked_lines: list[str]) -> list[str]:
    check_markers(marked_lines)
    max_width = PDF_WIDTH - 2 * PDF_MARGIN
    wrapped = [w for line in marked_lines for w in wrap_marked(line, max_width)]
    wrapped = [w for w in wrapped if w.strip()]
    doc = pymupdf.open()
    page, y = None, 0.0
    for line in wrapped:
        if page is None or y > PDF_HEIGHT - PDF_MARGIN:
            page = doc.new_page(width=PDF_WIDTH, height=PDF_HEIGHT)
            y = PDF_MARGIN + PDF_SIZE
        page.insert_text((PDF_MARGIN, y), strip_markers(line),
                         fontname=PDF_FONT, fontsize=PDF_SIZE)
        y += PDF_LEADING
    doc.set_metadata({"title": path.stem, "producer": "make_dataset.py",
                      "creator": "make_dataset.py", "creationDate": "",
                      "modDate": ""})
    doc.save(path, deflate=True, garbage=3, no_new_id=True)
    doc.close()
    read_back = read_document(path)
    assert [strip_markers(x) for x in wrapped] == read_back, path.name
    gold = [gold_line(x) for x in wrapped]
    write_gold(path, gold)
    return gold


def csv_text(spec: CsvSpec, marked: bool) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=spec.delimiter, quoting=spec.quoting,
                        lineterminator="\n")
    writer.writerow(spec.header)
    for row in spec.rows:
        writer.writerow(row if marked else [strip_markers(c) for c in row])
    return buffer.getvalue()


def make_csv_doc(path: Path, spec: CsvSpec) -> list[str]:
    check_markers([c for row in spec.rows for c in row])
    write_text(path, csv_text(spec, marked=False), spec.encoding, spec.newline)
    marked_read = read_csv(csv_text(spec, marked=True), spec.delimiter).lines
    read_back = read_document(path)
    assert [strip_markers(x) for x in marked_read] == read_back, path.name
    gold = [gold_line(x) for x in marked_read]
    write_gold(path, gold)
    return gold


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def build(out_dir: Path = OUT) -> list[Path]:
    """Write the whole set into ``out_dir`` and return the document paths."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.iterdir():
        if old.suffix.lower() in {".txt", ".csv", ".pdf"}:
            old.unlink()
    rng = random.Random(SEED)
    paths: list[Path] = []
    number = 0

    def next_name(stem: str, suffix: str) -> Path:
        nonlocal number
        number += 1
        return out_dir / f"G{number:02d}_{stem}{suffix}"

    # Two text instances of each template, with different people and
    # encodings.
    for copy in range(2):
        for i, (stem, template) in enumerate(TEXT_TEMPLATES):
            ages = STUDENT_AGES.get(stem, (18, 80))
            person = make_person(rng, *ages)
            encoding, newline = ENCODINGS[(i + copy * 3) % len(ENCODINGS)]
            if stem in UTF8_ONLY:
                encoding = "utf-8"
            path = next_name(stem, ".txt")
            make_text_doc(path, template(rng, person), encoding, newline)
            paths.append(path)

    for stem in PDF_TEMPLATES:
        template = dict(TEXT_TEMPLATES)[stem]
        person = make_person(rng, *STUDENT_AGES.get(stem, (18, 80)))
        path = next_name(stem, ".pdf")
        make_pdf_doc(path, template(rng, person))
        paths.append(path)

    for template, rows, variant in CSV_TEMPLATES:
        spec = template(rng, rows, variant)
        path = next_name(spec.name, ".csv")
        make_csv_doc(path, spec)
        paths.append(path)
    return paths


def main(argv: list[str]) -> None:
    out_dir = Path(argv[1]) if len(argv) > 1 else OUT
    paths = build(out_dir)
    by_kind = {}
    for p in paths:
        by_kind.setdefault(p.suffix, []).append(p)
    words = sum(len(x.split()) for p in paths for x in read_document(p))
    masked = sum(
        sum(1 for w in x.split() if w.strip(".,;:!?()[]{}\"'«»") == "*")
        for p in paths
        for x in p.with_name(f"{p.stem}.gold.txt").read_text(
            encoding="utf-8").splitlines()
    )
    print(f"{len(paths)} documents in {out_dir}: " + ", ".join(
        f"{len(v)} {k[1:].upper()}" for k, v in sorted(by_kind.items())))
    print(f"{words} words, {masked} to mask; a .gold.txt next to each one")


if __name__ == "__main__":
    main(sys.argv)
