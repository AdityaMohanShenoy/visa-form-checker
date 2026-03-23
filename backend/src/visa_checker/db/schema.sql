CREATE TABLE IF NOT EXISTS profiles (
    id              TEXT PRIMARY KEY,
    label           TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,

    -- MRZ-sourced fields (high confidence)
    surname             TEXT,
    given_names         TEXT,
    full_name           TEXT,
    passport_number     TEXT,
    nationality         TEXT,
    nationality_full    TEXT,
    date_of_birth       TEXT,
    gender              TEXT,
    expiry_date         TEXT,
    issuing_country     TEXT,
    document_type       TEXT,

    -- OCR-sourced fields (lower confidence)
    place_of_birth      TEXT,
    address_line1       TEXT,
    address_line2       TEXT,
    city                TEXT,
    state_province      TEXT,
    postal_code         TEXT,
    country             TEXT,
    issuing_authority   TEXT,
    issue_date          TEXT,

    -- Metadata
    mrz_raw             TEXT,
    mrz_confidence      REAL,
    ocr_confidence      REAL,
    source_image_hash   TEXT,
    notes               TEXT
);

CREATE TABLE IF NOT EXISTS profile_aliases (
    id          TEXT PRIMARY KEY,
    profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    field_name  TEXT NOT NULL,
    alias_value TEXT NOT NULL,
    UNIQUE(profile_id, field_name, alias_value)
);
