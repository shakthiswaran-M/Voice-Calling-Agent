MOCK_CUSTOMERS = {
    "12345": {"customer_id": "12345", "name": "Anusha", "phone": "+91 9876543210"},
}
 
MOCK_APPOINTMENTS = {
    "12345": {"date": "2026-08-28", "time": "15:00", "status": "scheduled"},
}
 
 
def get_customer(customer_id: str) -> dict:
    """Look up a customer's basic details by their customer ID."""
    customer = MOCK_CUSTOMERS.get(customer_id)
    if not customer:
        return {"error": f"No customer found with ID {customer_id}"}
    return customer
 
 
def get_appointment(customer_id: str) -> dict:
    """Look up a customer's upcoming appointment by their customer ID."""
    appointment = MOCK_APPOINTMENTS.get(customer_id)
    if not appointment:
        return {"error": f"No appointment found for customer {customer_id}"}
    return appointment
 
 
# Tool schemas — this is what tells the LLM these functions exist and
# what arguments they take, in the exact format Sarvam's function-calling expects.
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "get_customer",
            "description": "Get a customer's basic details using their customer ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": "The customer's unique ID.",
                    }
                },
                "required": ["customer_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_appointment",
            "description": "Get a customer's upcoming appointment using their customer ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": "The customer's unique ID.",
                    }
                },
                "required": ["customer_id"],
            },
        },
    },
]
 
# Maps a tool's name (as the LLM calls it) to the actual Python function
AVAILABLE_TOOLS = {
    "get_customer": get_customer,
    "get_appointment": get_appointment,
}