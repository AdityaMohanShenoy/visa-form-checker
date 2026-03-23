import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from visa_checker.database import get_db
from visa_checker.models import (
    ProfileCreate,
    ProfileUpdate,
    ProfileResponse,
    AliasCreate,
    AliasResponse,
)

router = APIRouter(tags=["Profiles"])

PROFILE_COLUMNS = [
    "id", "label", "created_at", "updated_at",
    "surname", "given_names", "full_name", "passport_number",
    "nationality", "nationality_full", "date_of_birth", "gender",
    "expiry_date", "issuing_country", "document_type",
    "place_of_birth", "address_line1", "address_line2",
    "city", "state_province", "postal_code", "country",
    "issuing_authority", "issue_date",
    "mrz_raw", "mrz_confidence", "ocr_confidence", "source_image_hash", "notes",
]


def _row_to_dict(row) -> dict:
    return {col: row[col] for col in PROFILE_COLUMNS}


@router.get("/profiles", response_model=list[ProfileResponse])
async def list_profiles():
    db = await get_db()
    cursor = await db.execute("SELECT * FROM profiles ORDER BY updated_at DESC")
    rows = await cursor.fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("/profiles", response_model=ProfileResponse, status_code=201)
async def create_profile(data: ProfileCreate):
    db = await get_db()
    profile_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    fields = data.model_dump(exclude_none=True)
    # Compute full_name if not provided
    if "full_name" not in fields and ("given_names" in fields or "surname" in fields):
        parts = [fields.get("given_names", ""), fields.get("surname", "")]
        fields["full_name"] = " ".join(p for p in parts if p).strip()

    columns = ["id", "label", "created_at", "updated_at"] + [
        k for k in fields if k != "label"
    ]
    values = [profile_id, fields["label"], now, now] + [
        fields[k] for k in fields if k != "label"
    ]
    placeholders = ", ".join("?" for _ in columns)
    col_str = ", ".join(columns)

    await db.execute(f"INSERT INTO profiles ({col_str}) VALUES ({placeholders})", values)
    await db.commit()

    cursor = await db.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
    row = await cursor.fetchone()
    return _row_to_dict(row)


@router.get("/profiles/{profile_id}", response_model=ProfileResponse)
async def get_profile(profile_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _row_to_dict(row)


@router.put("/profiles/{profile_id}", response_model=ProfileResponse)
async def update_profile(profile_id: str, data: ProfileUpdate):
    db = await get_db()
    cursor = await db.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Profile not found")

    fields = data.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    fields["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Recompute full_name if name parts change
    if "given_names" in fields or "surname" in fields:
        cursor = await db.execute(
            "SELECT given_names, surname FROM profiles WHERE id = ?", (profile_id,)
        )
        current = await cursor.fetchone()
        gn = fields.get("given_names", current["given_names"] or "")
        sn = fields.get("surname", current["surname"] or "")
        fields["full_name"] = " ".join(p for p in [gn, sn] if p).strip()

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [profile_id]

    await db.execute(f"UPDATE profiles SET {set_clause} WHERE id = ?", values)
    await db.commit()

    cursor = await db.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
    row = await cursor.fetchone()
    return _row_to_dict(row)


@router.delete("/profiles/{profile_id}", status_code=204)
async def delete_profile(profile_id: str):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM profiles WHERE id = ?", (profile_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Profile not found")
    await db.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
    await db.commit()


# --- Aliases ---

@router.post(
    "/profiles/{profile_id}/aliases",
    response_model=AliasResponse,
    status_code=201,
)
async def create_alias(profile_id: str, data: AliasCreate):
    db = await get_db()
    cursor = await db.execute("SELECT id FROM profiles WHERE id = ?", (profile_id,))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Profile not found")

    alias_id = str(uuid.uuid4())
    await db.execute(
        "INSERT INTO profile_aliases (id, profile_id, field_name, alias_value) VALUES (?, ?, ?, ?)",
        (alias_id, profile_id, data.field_name, data.alias_value),
    )
    await db.commit()
    return AliasResponse(
        id=alias_id,
        profile_id=profile_id,
        field_name=data.field_name,
        alias_value=data.alias_value,
    )


@router.delete("/profiles/{profile_id}/aliases/{alias_id}", status_code=204)
async def delete_alias(profile_id: str, alias_id: str):
    db = await get_db()
    result = await db.execute(
        "DELETE FROM profile_aliases WHERE id = ? AND profile_id = ?",
        (alias_id, profile_id),
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Alias not found")
