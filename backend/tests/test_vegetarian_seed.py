"""The seed menu must describe a fully vegetarian restaurant."""

import re
from pathlib import Path

from scripts.seed import ASSETS, MENU, RETIRED_ASSETS

BANNED = re.compile(
    r"\b(chicken|mutton|lamb|goat|beef|pork|bacon|ham|meat|keema|fish|salmon|tuna|prawns?|shrimp|crab|seafood|gelatin"
    r"|panna cotta)\b",
    re.I,
)
EGG = re.compile(r"(?<!egg)\beggs?\b", re.I)
ITEMS = [item for _, _, _, items in MENU for item in items]


def test_no_non_vegetarian_words():
    offenders = [i[0] for i in ITEMS if BANNED.search(f"{i[0]} {i[1]}") or EGG.search(f"{i[0]} {i[1]}")]
    assert offenders == []


def test_no_duplicate_names_and_realistic_prices():
    names = [i[0].lower() for i in ITEMS]
    assert len(names) == len(set(names))
    assert all(50 <= int(i[2]) <= 500 for i in ITEMS)


def test_every_item_has_a_bundled_photo_and_none_is_retired():
    images = [i[3] for i in ITEMS]
    assert all((Path(ASSETS) / f"{name}.jpg").exists() for name in images)
    assert not set(images) & set(RETIRED_ASSETS)
    assert not any((Path(ASSETS) / f"{name}.jpg").exists() for name in RETIRED_ASSETS)


def test_seed_has_available_and_unavailable_items():
    assert {i[6] for i in ITEMS} == {True, False}
