"""
Shared authentication dependency for all mutating/admin endpoints.
Validates the X-Admin-Key header against the ADMIN_KEY environment variable.
"""
import os
from fastapi import Header, HTTPException


async def require_admin_key(x_admin_key: str = Header(..., alias="X-Admin-Key")):
    """
    FastAPI dependency — validates the X-Admin-Key header.
    All write/admin endpoints must declare this as a dependency.
    """
    expected = os.getenv("ADMIN_KEY", "")
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="Server is not configured for admin operations (ADMIN_KEY not set)."
        )
    if x_admin_key != expected:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: invalid admin key."
        )
