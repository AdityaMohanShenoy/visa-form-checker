from pydantic import BaseModel, Field
from typing import Optional


class ProfileBase(BaseModel):
    label: str
    surname: Optional[str] = None
    given_names: Optional[str] = None
    full_name: Optional[str] = None
    passport_number: Optional[str] = None
    nationality: Optional[str] = None
    nationality_full: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    expiry_date: Optional[str] = None
    issuing_country: Optional[str] = None
    document_type: Optional[str] = None
    place_of_birth: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    issuing_authority: Optional[str] = None
    issue_date: Optional[str] = None
    notes: Optional[str] = None


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(BaseModel):
    label: Optional[str] = None
    surname: Optional[str] = None
    given_names: Optional[str] = None
    full_name: Optional[str] = None
    passport_number: Optional[str] = None
    nationality: Optional[str] = None
    nationality_full: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    expiry_date: Optional[str] = None
    issuing_country: Optional[str] = None
    document_type: Optional[str] = None
    place_of_birth: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    issuing_authority: Optional[str] = None
    issue_date: Optional[str] = None
    notes: Optional[str] = None


class ProfileResponse(ProfileBase):
    id: str
    created_at: str
    updated_at: str
    mrz_raw: Optional[str] = None
    mrz_confidence: Optional[float] = None
    ocr_confidence: Optional[float] = None
    source_image_hash: Optional[str] = None


class MRZFields(BaseModel):
    surname: Optional[str] = None
    given_names: Optional[str] = None
    passport_number: Optional[str] = None
    nationality: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    expiry_date: Optional[str] = None
    issuing_country: Optional[str] = None
    document_type: Optional[str] = None


class MRZResult(BaseModel):
    success: bool
    raw: Optional[str] = None
    fields: Optional[MRZFields] = None
    check_digits_valid: Optional[bool] = None
    error: Optional[str] = None


class OCRResult(BaseModel):
    mrz: MRZResult
    image_hash: Optional[str] = None


class CompareRequest(BaseModel):
    profile_id: str
    form_fields: dict[str, str]


class FieldMatch(BaseModel):
    form_field: str
    form_value: str
    expected_value: str
    match_type: str  # "exact", "case_insensitive", "alias", "subset"


class FieldMismatch(BaseModel):
    form_field: str
    form_value: str
    expected_value: str
    severity: str  # "error", "warning"
    message: str


class CompareResponse(BaseModel):
    mismatches: list[FieldMismatch] = Field(default_factory=list)
    matches: list[FieldMatch] = Field(default_factory=list)
    unmatched_fields: list[str] = Field(default_factory=list)


class AliasCreate(BaseModel):
    field_name: str
    alias_value: str


class AliasResponse(BaseModel):
    id: str
    profile_id: str
    field_name: str
    alias_value: str
