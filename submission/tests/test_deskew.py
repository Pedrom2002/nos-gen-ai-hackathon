from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFont

from anonimizador import deskew

FONTS = [Path(r"C:\Windows\Fonts\arial.ttf"),
         Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
         Path("/System/Library/Fonts/Supplemental/Arial.ttf")]
FONT = next((f for f in FONTS if f.exists()), None)
pytestmark = pytest.mark.skipif(FONT is None, reason="no TrueType font")

TEXT = ["Relatório de Admissão - Centro Médico Lisboa",
        "Nome: Maria Conceição Oliveira Santos",
        "Data de Nascimento: 12/03/1978",
        "NIF: 097865413   Cartão de Cidadão: 12345678-9ZX0",
        "Morada: Rua das Flores, 123, Apt 45, Sacavém, Lisboa",
        "Telefone: +351 912 345 678",
        "Email: maria.santos@emailpessoal.pt",
        "Número da Segurança Social: 11223344556"]


def page(size=(1000, 800)):
    image = Image.new("RGB", size, "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(FONT), 26)
    for row, text in enumerate(TEXT):
        draw.text((60, 60 + row * 80), text, fill="black", font=font)
    return image


def tilted(angle):
    """The page turned counter-clockwise by ``angle`` degrees, as a photo
    held crooked would show it, with no border to find."""
    return page().rotate(angle, expand=True, fillcolor="white",
                         resample=Image.BICUBIC)


@pytest.mark.parametrize("angle", [-6, -3, -1.5, 1.5, 3, 6])
def test_skew_is_estimated_for_every_tilt(angle):
    # The estimate is the turn that levels the lines: the opposite one.
    assert deskew.estimate_skew(tilted(angle)) == pytest.approx(
        -angle, abs=0.4)


def test_a_level_page_and_an_empty_one_need_no_turn():
    assert deskew.estimate_skew(page()) == 0.0
    assert deskew.estimate_skew(Image.new("RGB", (800, 600), "white")) == 0.0


def test_a_level_page_gets_no_warp():
    assert deskew.page_warp(page()) is None


@pytest.mark.parametrize("angle", [-5, 2.5, 5])
def test_a_tilted_page_is_levelled_by_a_warp(angle):
    image = tilted(angle)
    warp = deskew.page_warp(image)
    assert warp is not None
    assert abs(deskew.estimate_skew(warp.flatten(image))) <= 0.4


def test_boxes_found_on_the_levelled_page_map_back_to_the_photo():
    image = tilted(4)
    spot = (300, 250)
    ImageDraw.Draw(image).rectangle(
        [spot[0] - 3, spot[1] - 3, spot[0] + 3, spot[1] + 3],
        fill=(255, 0, 0))
    warp = deskew.page_warp(image)
    flat = np.asarray(warp.flatten(image)).astype(int)
    red = (flat[..., 0] > 200) & (flat[..., 1] < 90) & (flat[..., 2] < 90)
    ys, xs = np.nonzero(red)
    assert len(xs) > 0
    (x, y), = warp.to_original([(xs.mean(), ys.mean())])
    assert (x, y) == pytest.approx(spot, abs=2.0)
