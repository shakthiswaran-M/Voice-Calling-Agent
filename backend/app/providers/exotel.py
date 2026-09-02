from typing import Optional
import httpx

from app.config import settings


async def place_call(
    customer_number: str,
    caller_id: Optional[str] = None,
    call_type: str = "trans",
):
    if not settings.exotel_sid:
        raise ValueError("Exotel SID is not configured")

    if not settings.exotel_api_key:
        raise ValueError("Exotel API key is not configured")

    if not settings.exotel_api_token:
        raise ValueError("Exotel API token is not configured")

    if not customer_number:
        raise ValueError("Customer phone number is required")

    exotel_caller_id = caller_id or settings.exotel_caller_id

    if not exotel_caller_id:
        raise ValueError("Exotel caller ID is not configured")

    url = (
        f"https://{settings.exotel_subdomain}"
        f"/v1/Accounts/{settings.exotel_sid}/Calls/connect.json"
    )

    data = {
        "From": exotel_caller_id,
        "To": customer_number,
        "CallerId": exotel_caller_id,
        "CallType": call_type,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            url,
            data=data,
            auth=(
                settings.exotel_api_key,
                settings.exotel_api_token,
            ),
        )

    response.raise_for_status()

    return response.json()