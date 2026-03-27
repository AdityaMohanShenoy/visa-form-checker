from visa_checker.services.compare_service import compare_fields


def _has_match(result, field_name: str) -> bool:
    return any(m.form_field == field_name for m in result.matches)


def _has_mismatch(result, field_name: str) -> bool:
    return any(m.form_field == field_name for m in result.mismatches)


def test_date_of_birth_matches_dd_mm_yyyy_against_iso_profile_date():
    profile = {"date_of_birth": "1978-11-02"}
    form_fields = {"date_of_birth": "02/11/1978"}

    result = compare_fields(profile, form_fields)

    assert _has_match(result, "date_of_birth")
    assert not _has_mismatch(result, "date_of_birth")


def test_date_of_birth_matches_compact_numeric_date():
    profile = {"date_of_birth": "1978-11-02"}
    form_fields = {"date_of_birth": "02111978"}

    result = compare_fields(profile, form_fields)

    assert _has_match(result, "date_of_birth")
    assert not _has_mismatch(result, "date_of_birth")


def test_full_name_matches_when_form_uses_surname_then_given_names():
    profile = {
        "surname": "ARANI",
        "given_names": "DELLI BABU",
        # Existing profiles may have this legacy order.
        "full_name": "DELLI BABU ARANI",
    }
    form_fields = {"full_name": "ARANI DELLI BABU"}

    result = compare_fields(profile, form_fields)

    assert _has_match(result, "full_name")
    assert not _has_mismatch(result, "full_name")
