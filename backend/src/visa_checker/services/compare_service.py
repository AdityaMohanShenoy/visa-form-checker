"""Field comparison service with normalization, date parsing, and nationality matching."""

import re
from datetime import datetime

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
        # Forms are commonly DD/MM/YYYY.
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d/%m/%y",
        "%d-%m-%y",
        # ISO and MRZ-adjacent forms.
        "%Y-%m-%d",
        "%m/%d/%Y",
        "%m-%d-%Y",
        "%Y/%m/%d",
        "%d %b %Y",
        "%d %B %Y",
        "%b %d, %Y",
        "%B %d, %Y",
        "%Y%m%d",
        "%y%m%d",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _date_candidates(s: str) -> set[tuple[int, int, int]]:
    """Return valid (year, month, day) candidates from a date string."""
    candidates: set[tuple[int, int, int]] = set()
    parsed = _parse_date(s)
    if parsed:
        candidates.add((parsed.year, parsed.month, parsed.day))

    digits = re.sub(r"[^0-9]", "", s)
    if len(digits) == 8:
        # YYYYMMDD
        y, m, d = int(digits[0:4]), int(digits[4:6]), int(digits[6:8])
        try:
            datetime(y, m, d)
            candidates.add((y, m, d))
        except ValueError:
            pass

        # DDMMYYYY
        d, m, y = int(digits[0:2]), int(digits[2:4]), int(digits[4:8])
        try:
            datetime(y, m, d)
            candidates.add((y, m, d))
        except ValueError:
            pass

    if len(digits) == 6:
        # YYMMDD
        yy, m, d = int(digits[0:2]), int(digits[2:4]), int(digits[4:6])
        y = 2000 + yy if yy < 50 else 1900 + yy
        try:
            datetime(y, m, d)
            candidates.add((y, m, d))
        except ValueError:
            pass

        # DDMMYY
        d, m, yy = int(digits[0:2]), int(digits[2:4]), int(digits[4:6])
        y = 2000 + yy if yy < 50 else 1900 + yy
        try:
            datetime(y, m, d)
            candidates.add((y, m, d))
        except ValueError:
            pass

    return candidates


def _compare_dates(form_value: str, expected: str) -> tuple[bool, str]:
    """Compare two date strings. Returns (match, match_type)."""
    form_dates = _date_candidates(form_value)
    expected_dates = _date_candidates(expected)
    if form_dates and expected_dates and form_dates.intersection(expected_dates):
        return True, "date_match"
    # Fallback to strict numeric match only when parsing failed.
    norm_f = re.sub(r"[^0-9]", "", form_value)
    norm_e = re.sub(r"[^0-9]", "", expected)
    if norm_f == norm_e and norm_f:
        return True, "numeric_match"
    return False, ""


def _compose_full_name(given_names: str | None, surname: str | None, surname_first: bool) -> str:
    """Compose a full name from parts."""
    if surname_first:
        parts = [surname or "", given_names or ""]
    else:
        parts = [given_names or "", surname or ""]
    return " ".join(p.strip() for p in parts if p and p.strip()).strip()


def _get_full_name_variants(profile: dict) -> set[str]:
    """Build normalized full-name variants from stored fields."""
    variants: set[str] = set()
    stored = profile.get("full_name")
    if stored:
        variants.add(_normalize_text(stored))

    given_names = profile.get("given_names")
    surname = profile.get("surname")
    for surname_first in (True, False):
        composed = _compose_full_name(given_names, surname, surname_first=surname_first)
        if composed:
            variants.add(_normalize_text(composed))

    return {v for v in variants if v}


def _preferred_full_name(profile: dict) -> str | None:
    """Return the canonical display order: SURNAME followed by GIVEN NAMES."""
    composed = _compose_full_name(
        profile.get("given_names"),
        profile.get("surname"),
        surname_first=True,
    )
    if composed:
        return composed
    return profile.get("full_name")


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
        expected_variants: set[str] = set()
        if canonical == "full_name":
            preferred = _preferred_full_name(profile)
            if preferred:
                expected = preferred
            expected_variants = _get_full_name_variants(profile)

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
        if canonical == "full_name":
            comparison_variants = expected_variants or {norm_expected}
            if norm_form in comparison_variants:
                matches.append(FieldMatch(
                    form_field=form_key,
                    form_value=form_value,
                    expected_value=expected,
                    match_type="case_insensitive",
                ))
                continue
        elif norm_form == norm_expected:
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
            form_parts = norm_form.split()
            variants_to_check = expected_variants or {norm_expected}
            subset_matched = False
            for variant in variants_to_check:
                expected_parts = variant.split()
                if form_parts and all(p in expected_parts for p in form_parts):
                    matches.append(FieldMatch(
                        form_field=form_key,
                        form_value=form_value,
                        expected_value=expected,
                        match_type="subset",
                    ))
                    subset_matched = True
                    break
            if subset_matched:
                continue

        # Fuzzy match — compare against full string and individual parts (for name fields)
        variants_to_check = expected_variants or {norm_expected}
        min_dist = min(levenshtein_distance(norm_form, v) for v in variants_to_check)

        # For name fields, also check distance against each individual part
        if canonical in ("given_names", "full_name", "surname"):
            for variant in variants_to_check:
                for part in variant.split():
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
