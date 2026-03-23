from fastapi import APIRouter, HTTPException

from visa_checker.database import get_db
from visa_checker.models import CompareRequest, CompareResponse
from visa_checker.services.compare_service import compare_fields

router = APIRouter(tags=["Compare"])


@router.post("/compare", response_model=CompareResponse)
async def compare_form(data: CompareRequest):
    """Compare form field values against a stored profile."""
    db = await get_db()

    # Fetch profile
    cursor = await db.execute("SELECT * FROM profiles WHERE id = ?", (data.profile_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = dict(row)

    # Fetch aliases
    cursor = await db.execute(
        "SELECT field_name, alias_value FROM profile_aliases WHERE profile_id = ?",
        (data.profile_id,),
    )
    aliases = [dict(r) for r in await cursor.fetchall()]

    result = compare_fields(profile, data.form_fields, aliases)
    return result
