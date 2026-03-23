"""Field comparison service with normalization, date parsing, and nationality matching."""

import re
from datetime import datetime
from unicodedata import normalize, category

from Levenshtein import distance as levenshtein_distance
from unidecode import unidecode

from visa_checker.models import CompareRequest, CompareResponse, FieldMatch, FieldMismatch
from visa_checker.services.nationality import nationalities_match

# Map common form field names to canonical profile field names
FIELD_NAME_MAP: dict[str, str] = {
    # Name fields
    "first_name": "given_names",
    "firstname": "given_names",
    "given_name": "given_names",
    "givenname": "given_names",
    "given_names": "given_names",
    "last_name": "surname",
    "lastname": "surname",
    "surname": "surname",
    "family_name": "surname",
    "familyname": "surname",
    "full_name": "full_name",
    "fullname": "full_name",
    "name": "full_name",
    # Passport
    "passport_no": "passport_number",
    "passport_number": "passport_number",
    "passport_num": "passport_number",
    "travel_doc_number": "passport_number",
    # Dates
    "dob": "date_of_birth",
    "date_of_birth": "date_of_birth",
    "birth_date": "date_of_birth",
    "birthdate": "date_of_birth",
    "dob_day": "dob_day",
    "dob_month": "dob_month",
    "dob_year": "dob_year",
    "expiry_date": "expiry_date",
    "passport_expiry": "expiry_date",
    "exp_date": "expiry_date",
    "issue_date": "issue_date",
    # Nationality/gender
    "nationality": "nationality",
    "citizenship": "nationality",
    "gender": "gender",
    "sex": "gender",
    # Location
    "place_of_birth": "place_of_birth",
    "birth_place": "place_of_birth",
    "birthplace": "place_of_birth",
    "country": "country",
    "address": "address_line1",
    "address_line1": "address_line1",
    "address_line2": "address_line2",
    "city": "city",
    "state": "state_province",
    "province": "state_province",
    "postal_code": "postal_code",
    "zip_code": "postal_code",
    "zipcode": "postal_code",
}


def _strip_diacritics(s: str) -> str:
    """Remove diacritics and transliterate to ASCII."""
    return unidecode(s)


def _normalize_text(s: str) -> str:
    """Normalize text for comparison: uppercase, strip diacritics, remove extra whitespace."""
    s = _strip_diacritics(s)
    s = s.upper().strip()
    s = re.sub(r"\s+", " ", s)
    return s


def _parse_date(s: str) -> datetime | None:
    """Try to parse a date string in various formats."""
    s = s.strip()
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%d %b %Y",
        "%d %B %Y",
        "%b %d, %Y",
        "%B %d, %Y",
        "%Y%m%d",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _compare_dates(form_value: str, expected: str) -> tuple[bool, str]:
    """Compare two date strings. Returns (match, match_type)."""
    fd = _parse_date(form_value)
    ed = _parse_date(expected)
    if fd and ed:
        if fd == ed:
            return True, "date_match"
        return False, ""
    # Fallback to string comparison
    norm_f = re.sub(r"[^0-9]", "", form_value)
    norm_e = re.sub(r"[^0-9]", "", expected)
    if norm_f == norm_e:
        return True, "numeric_match"
    return False, ""


def _compare_date_parts(
    profile: dict, form_fields: dict, matches: list, mismatches: list
):
    """Handle split date fields (dob_day, dob_month, dob_year)."""
    dob = profile.get("date_of_birth")
    if not dob:
        return

    parsed = _parse_date(dob)
    if not parsed:
        return

    parts = {
        "dob_day": str(parsed.day).zfill(2),
        "dob_month": str(parsed.month).zfill(2),
        "dob_year": str(parsed.year),
    }

    for field_key, expected in parts.items():
        if field_key in form_fields:
            form_val = form_fields[field_key].strip()
            # Normalize: strip leading zeros for comparison
            if form_val.lstrip("0") == expected.lstrip("0"):
                matches.append(FieldMatch(
                    form_field=field_key,
                    form_value=form_val,
                    expected_value=expected,
                    match_type="exact",
                ))
            else:
                mismatches.append(FieldMismatch(
                    form_field=field_key,
                    form_value=form_val,
                    expected_value=expected,
                    severity="error",
                    message=f"Date part mismatch: '{form_val}' vs expected '{expected}'",
                ))


def compare_fields(
    profile: dict, form_fields: dict, aliases: list[dict] | None = None
) -> CompareResponse:
    """Compare form fields against a profile, returning matches and mismatches."""
    matches: list[FieldMatch] = []
    mismatches: list[FieldMismatch] = []
    unmatched: list[str] = []

    # Build alias lookup: {field_name: set of alias values (normalized)}
    alias_lookup: dict[str, set[str]] = {}
    if aliases:
        for a in aliases:
            key = a["field_name"]
            alias_lookup.setdefault(key, set()).add(_normalize_text(a["alias_value"]))

    # Handle split date fields first
    _compare_date_parts(profile, form_fields, matches, mismatches)
    handled_keys = {"dob_day", "dob_month", "dob_year"}

    for form_key, form_value in form_fields.items():
        if form_key in handled_keys:
            continue

        # Map form field name to canonical profile field
        canonical = FIELD_NAME_MAP.get(form_key.lower())
        if not canonical:
            unmatched.append(form_key)
            continue

        expected = profile.get(canonical)
        if expected is None or expected == "":
            unmatched.append(form_key)
            continue

        norm_form = _normalize_text(form_value)
        norm_expected = _normalize_text(expected)

        # Skip empty form values
        if not norm_form:
            continue

        # Nationality comparison
        if canonical == "nationality":
            if nationalities_match(form_value, expected):
                matches.append(FieldMatch(
                    form_field=form_key,
                    form_value=form_value,
                    expected_value=expected,
                    match_type="nationality_match",
                ))
            else:
                mismatches.append(FieldMismatch(
                    form_field=form_key,
                    form_value=form_value,
                    expected_value=expected,
                    severity="error",
                    message=f"Nationality mismatch: '{form_value}' vs expected '{expected}'",
                ))
            continue

        # Date comparison
        if canonical in ("date_of_birth", "expiry_date", "issue_date"):
            matched, match_type = _compare_dates(form_value, expected)
            if matched:
                matches.append(FieldMatch(
                    form_field=form_key,
                    form_value=form_value,
                    expected_value=expected,
                    match_type=match_type,
                ))
            else:
                mismatches.append(FieldMismatch(
                    form_field=form_key,
                    form_value=form_value,
                    expected_value=expected,
                    severity="error",
                    message=f"Date mismatch: '{form_value}' vs expected '{expected}'",
                ))
            continue

        # Gender comparison
        if canonical == "gender":
            gender_map = {"M": "MALE", "F": "FEMALE", "X": "OTHER"}
            norm_f = norm_form
            norm_e = norm_expected
            # Expand single-letter codes
            norm_f = gender_map.get(norm_f, norm_f)
            norm_e = gender_map.get(norm_e, norm_e)
            if norm_f == norm_e:
                matches.append(FieldMatch(
                    form_field=form_key,
                    form_value=form_value,
                    expected_value=expected,
                    match_type="exact",
                ))
            else:
                mismatches.append(FieldMismatch(
                    form_field=form_key,
                    form_value=form_value,
                    expected_value=expected,
                    severity="error",
                    message=f"Gender mismatch: '{form_value}' vs expected '{expected}'",
                ))
            continue

        # Exact match (case-insensitive, diacritics-stripped)
        if norm_form == norm_expected:
            matches.append(FieldMatch(
                form_field=form_key,
                form_value=form_value,
                expected_value=expected,
                match_type="case_insensitive",
            ))
            continue

        # Alias check
        field_aliases = alias_lookup.get(canonical, set())
        if norm_form in field_aliases:
            matches.append(FieldMatch(
                form_field=form_key,
                form_value=form_value,
                expected_value=expected,
                match_type="alias",
            ))
            continue

        # Subset match for name fields (e.g., "JOHN" in "JOHN WILLIAM")
        if canonical in ("given_names", "full_name"):
            expected_parts = norm_expected.split()
            form_parts = norm_form.split()
            if all(p in expected_parts for p in form_parts):
                matches.append(FieldMatch(
                    form_field=form_key,
                    form_value=form_value,
                    expected_value=expected,
                    match_type="subset",
                ))
                continue

        # Fuzzy match — compare against full string and individual parts (for name fields)
        dist = levenshtein_distance(norm_form, norm_expected)
        min_dist = dist

        # For name fields, also check distance against each individual part
        if canonical in ("given_names", "full_name", "surname"):
            for part in norm_expected.split():
                part_dist = levenshtein_distance(norm_form, part)
                min_dist = min(min_dist, part_dist)

        if min_dist <= 2 and len(norm_form) > 1:
            mismatches.append(FieldMismatch(
                form_field=form_key,
                form_value=form_value,
                expected_value=expected,
                severity="warning",
                message=f"Possible typo (edit distance {min_dist}): '{form_value}' vs expected '{expected}'",
            ))
        else:
            mismatches.append(FieldMismatch(
                form_field=form_key,
                form_value=form_value,
                expected_value=expected,
                severity="error",
                message=f"Mismatch: '{form_value}' vs expected '{expected}'",
            ))

    return CompareResponse(
        mismatches=mismatches,
        matches=matches,
        unmatched_fields=unmatched,
    )
