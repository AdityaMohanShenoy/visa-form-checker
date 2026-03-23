"""Mapping between ISO 3166-1 alpha-3 codes, country names, and nationality adjectives."""

# Common mappings used in visa/passport contexts
_NATIONALITY_MAP: dict[str, dict] = {
    "AFG": {"name": "Afghanistan", "adj": ["Afghan"]},
    "AUS": {"name": "Australia", "adj": ["Australian"]},
    "BGD": {"name": "Bangladesh", "adj": ["Bangladeshi"]},
    "BRA": {"name": "Brazil", "adj": ["Brazilian"]},
    "CAN": {"name": "Canada", "adj": ["Canadian"]},
    "CHN": {"name": "China", "adj": ["Chinese"]},
    "DEU": {"name": "Germany", "adj": ["German"]},
    "EGY": {"name": "Egypt", "adj": ["Egyptian"]},
    "ESP": {"name": "Spain", "adj": ["Spanish"]},
    "FRA": {"name": "France", "adj": ["French"]},
    "GBR": {"name": "United Kingdom", "adj": ["British", "UK"]},
    "IDN": {"name": "Indonesia", "adj": ["Indonesian"]},
    "IND": {"name": "India", "adj": ["Indian"]},
    "IRL": {"name": "Ireland", "adj": ["Irish"]},
    "ITA": {"name": "Italy", "adj": ["Italian"]},
    "JPN": {"name": "Japan", "adj": ["Japanese"]},
    "KOR": {"name": "South Korea", "adj": ["Korean", "South Korean"]},
    "LKA": {"name": "Sri Lanka", "adj": ["Sri Lankan"]},
    "MEX": {"name": "Mexico", "adj": ["Mexican"]},
    "MYS": {"name": "Malaysia", "adj": ["Malaysian"]},
    "NLD": {"name": "Netherlands", "adj": ["Dutch", "Netherlandic"]},
    "NPL": {"name": "Nepal", "adj": ["Nepalese", "Nepali"]},
    "NZL": {"name": "New Zealand", "adj": ["New Zealander"]},
    "PAK": {"name": "Pakistan", "adj": ["Pakistani"]},
    "PHL": {"name": "Philippines", "adj": ["Filipino", "Philippine"]},
    "PRT": {"name": "Portugal", "adj": ["Portuguese"]},
    "RUS": {"name": "Russia", "adj": ["Russian"]},
    "SAU": {"name": "Saudi Arabia", "adj": ["Saudi", "Saudi Arabian"]},
    "SGP": {"name": "Singapore", "adj": ["Singaporean"]},
    "THA": {"name": "Thailand", "adj": ["Thai"]},
    "TUR": {"name": "Turkey", "adj": ["Turkish"]},
    "TWN": {"name": "Taiwan", "adj": ["Taiwanese"]},
    "UAE": {"name": "United Arab Emirates", "adj": ["Emirati", "UAE"]},
    "USA": {"name": "United States", "adj": ["American", "US", "U.S."]},
    "VNM": {"name": "Vietnam", "adj": ["Vietnamese"]},
    "ZAF": {"name": "South Africa", "adj": ["South African"]},
}

# Build reverse lookup: any variant (name, adjective) -> ISO code
_REVERSE: dict[str, str] = {}
for code, info in _NATIONALITY_MAP.items():
    _REVERSE[code.upper()] = code
    _REVERSE[info["name"].upper()] = code
    for adj in info["adj"]:
        _REVERSE[adj.upper()] = code


def normalize_nationality(value: str) -> str | None:
    """Convert any nationality representation to ISO 3166-1 alpha-3."""
    return _REVERSE.get(value.strip().upper())


def nationalities_match(a: str, b: str) -> bool:
    """Check if two nationality strings refer to the same country."""
    code_a = normalize_nationality(a)
    code_b = normalize_nationality(b)
    if code_a and code_b:
        return code_a == code_b
    # Fallback: case-insensitive exact match
    return a.strip().upper() == b.strip().upper()


def get_full_name(code: str) -> str | None:
    """Get the full country name for an ISO code."""
    info = _NATIONALITY_MAP.get(code.upper())
    return info["name"] if info else None
