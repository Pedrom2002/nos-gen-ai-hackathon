"""A CSV is laid out cell by cell and written back with the same shape."""

from anonimizador.tabular import read_csv, sniff_delimiter, write_csv

ROWS = ('nome,nif,morada\n'
        'Maria Santos,123456789,"Rua das Flores 23, 2º Esq"\n')


def test_sniffs_the_delimiter_even_with_commas_inside_cells():
    assert sniff_delimiter("a,b\n1,2\n") == ","
    assert sniff_delimiter("nome;morada\nAna;Rua A, 1, Lisboa\n"
                           "Rui;Rua B, 2, Porto\n") == ";"
    assert sniff_delimiter("a\tb\n1\t2\n") == "\t"
    assert sniff_delimiter("só uma coluna\noutra linha\n") == ","


def test_rows_become_lines_with_the_separators_on_their_own():
    table = read_csv(ROWS)
    assert table.delimiter == ","
    assert table.lines == [
        "nome , nif , morada",
        "Maria Santos , 123456789 , Rua das Flores 23, 2º Esq",
    ]
    assert table.separators == {(0, 1), (0, 3), (1, 2), (1, 4)}
    assert all(table.lines[n].split()[i] == ","
               for n, i in table.separators)


def test_empty_cells_blank_rows_and_line_breaks_inside_cells():
    table = read_csv('a,,c\n\n,x,\n"linha\npartida",y\n')
    assert table.lines == ["a , , c", ", x ,", "linha partida , y"]
    assert table.separators == {(0, 1), (0, 2), (1, 0), (1, 2), (2, 2)}


def test_tab_separated_rows_show_a_pipe_between_the_cells():
    table = read_csv("a\tb\n1\t2\n")
    assert table.delimiter == "\t"
    assert table.lines == ["a | b", "1 | 2"]
    assert write_csv(table.lines, table.separators, "\t") == "a\tb\n1\t2\n"


def test_masked_lines_are_written_back_as_the_same_csv():
    table = read_csv(ROWS)
    masked = [table.lines[0], "* * , * , * * * *, * *"]
    out = write_csv(masked, table.separators, table.delimiter)
    assert out == 'nome,nif,morada\n* *,*,"* * * *, * *"\n'
    assert read_csv(out, ",").lines == masked


def test_unmasked_rows_come_back_as_they_were_read():
    table = read_csv(ROWS)
    out = write_csv(table.lines, table.separators, table.delimiter)
    assert out == ROWS
