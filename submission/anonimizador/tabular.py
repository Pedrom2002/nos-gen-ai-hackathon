"""CSV rows as lines the pipeline can mask cell by cell.

The pipeline splits every line on whitespace, and a CSV row has almost
none: "Maria Santos,123456789,maria@x.pt" is one word. The model would
mask the whole row as one name, the report would count one item, the
reviewer could not keep one cell and mask the next, and the commas would
vanish with the mask. So each row becomes a line where the cells are
separated by the delimiter on its own ("Maria Santos , 123456789 ,
maria@x.pt"): every cell is its own words, the model and the safety net
see each value, and the separators are never masked
(pipeline.keep_visible), so a row keeps its columns. The redacted file
(redact.py) is the same rows written back as CSV, with the same delimiter.
"""

import csv
import io
from dataclasses import dataclass, field
from itertools import islice

# Tried in this order; the first wins a tie.
DELIMITERS = ",;\t|"
# A tab is whitespace, so it cannot be a word: tab-separated rows show a
# pipe between the cells instead. The file is still written back with tabs.
TOKENS = {"\t": "|"}
# Lines and rows read to pick the delimiter.
SAMPLE_LINES = 200
SAMPLE_ROWS = 20


@dataclass
class Table:
    delimiter: str
    lines: list[str]
    # (line, word index) of every separator token in ``lines``.
    separators: set[tuple[int, int]] = field(default_factory=set)


def _column_counts(text: str, delimiter: str) -> list[int]:
    reader = csv.reader(islice(io.StringIO(text), SAMPLE_LINES),
                        delimiter=delimiter)
    try:
        rows = [row for row in reader if any(c.strip() for c in row)]
    except csv.Error:
        return []
    return [len(row) for row in rows[:SAMPLE_ROWS]]


def sniff_delimiter(text: str) -> str:
    """The delimiter that splits the first rows into the same number of
    columns most often, two columns at least. A comma inside a few cells
    does not beat the ";" between all of them, and a single-column file
    keeps the default."""
    best, best_score = DELIMITERS[0], (0, 0)
    for candidate in DELIMITERS:
        counts = _column_counts(text, candidate)
        if not counts:
            continue
        columns = max(set(counts), key=counts.count)
        score = (counts.count(columns) if columns >= 2 else 0, columns)
        if score > best_score:
            best, best_score = candidate, score
    return best


def read_csv(text: str, delimiter: str | None = None) -> Table:
    """Lay the rows out as lines, one per non-empty row.

    Each cell's words are joined by one space (line breaks inside a cell
    included), and the cells are separated by the delimiter on its own, so
    ``line.split()`` gives the cells' words plus one token per separator.
    """
    delimiter = delimiter or sniff_delimiter(text)
    token = TOKENS.get(delimiter, delimiter)
    table = Table(delimiter, [])
    for row in csv.reader(io.StringIO(text), delimiter=delimiter):
        cells = [cell.split() for cell in row]
        if not any(cells):
            continue
        line_no = len(table.lines)
        words: list[str] = []
        for k, cell in enumerate(cells):
            if k:
                table.separators.add((line_no, len(words)))
                words.append(token)
            words += cell
        table.lines.append(" ".join(words))
    return table


def write_csv(lines: list[str], separators: set[tuple[int, int]],
              delimiter: str) -> str:
    """The lines (masked or not) back as CSV text, one row per line.

    The words between two separators form a cell; a cell that holds the
    delimiter or a quote is quoted by the csv module, as usual.
    """
    out = io.StringIO()
    writer = csv.writer(out, delimiter=delimiter, lineterminator="\n")
    for line_no, line in enumerate(lines):
        cells: list[list[str]] = [[]]
        for index, word in enumerate(line.split()):
            if (line_no, index) in separators:
                cells.append([])
            else:
                cells[-1].append(word)
        writer.writerow(" ".join(cell) for cell in cells)
    return out.getvalue()
