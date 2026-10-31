from app.api.v1.endpoints.search import escape_like, normalize_place_query


def test_normalizes_spaces_case_and_hyphens() -> None:
    assert normalize_place_query(" Saint-Denis ") == "saint denis"
    assert normalize_place_query("saint   denis") == "saint denis"


def test_preserves_wildcard_escaping() -> None:
    assert escape_like(normalize_place_query("%_")) == r"\%\_"
