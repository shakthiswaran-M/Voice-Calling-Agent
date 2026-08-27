
from uuid import uuid4

from app.database import database

# Reference data is seeded into PostgreSQL during application startup.

MOCK_CUSTOMERS = {
    "12345": {
        "customer_id": "12345",
        "name": "Anusha",
        "phone": "+91 9876543210",
    },
}

MOCK_APPOINTMENTS = {
    "12345": {
        "date": "2026-08-28",
        "time": "15:00",
        "status": "scheduled",
    },
}

MOCK_LEADS = {}

MOCK_SERVICES = {
    "AI/ML": {
        "name": "AI/ML",
        "description": "AI and machine learning solutions for business needs.",
    },
    "chatbots": {
        "name": "Chatbots",
        "description": "Intelligent chatbot solutions for customer and business interactions.",
    },
    "SaaS development": {
        "name": "SaaS Development",
        "description": "Scalable software-as-a-service application development.",
    },
    "enterprise applications": {
        "name": "Enterprise Applications",
        "description": "Enterprise-grade applications designed for business operations.",
    },
    "cloud/migration": {
        "name": "Cloud / Migration",
        "description": "Cloud solutions and migration support for modernizing applications and infrastructure.",
    },
    "DevOps": {
        "name": "DevOps",
        "description": "DevOps solutions for development, deployment, automation, and operations.",
    },
    "IT consulting": {
        "name": "IT Consulting",
        "description": "IT consulting services to help organizations plan and implement technology solutions.",
    },
    "enterprise architecture": {
        "name": "Enterprise Architecture",
        "description": "Enterprise architecture solutions for designing scalable technology systems.",
    },
}

MOCK_CONSULTATION_SLOTS = [
    {
        "date": "2026-08-28",
        "time": "10:00",
        "available": True,
    },
    {
        "date": "2026-08-28",
        "time": "15:00",
        "available": True,
    },
    {
        "date": "2026-08-29",
        "time": "11:00",
        "available": True,
    },
]

MOCK_CONSULTATIONS = {}

MOCK_CASE_STUDIES = {
    "APPGM": {
        "name": "APPGM",
        "description": "APPGM case study.",
    },
    "HEB": {
        "name": "HEB",
        "description": "HEB case study.",
    },
    "WhyScience": {
        "name": "WhyScience",
        "description": "WhyScience case study.",
    },
}

MOCK_FAQS = {
    "iso 27001": {
        "topic": "ISO 27001",
        "answer": "NetKathir's ISO 27001 information should be provided from the company's approved FAQ information.",
    },
    "founded": {
        "topic": "Company founding year",
        "answer": "NetKathir was founded in 2015.",
    },
    "engagement process": {
        "topic": "Engagement process",
        "answer": "NetKathir's typical engagement process should follow the company's approved engagement workflow.",
    },
}



# EXISTING TEAM TOOLS


async def get_customer(customer_id: str) -> dict:
    """Look up a customer's basic details by their customer ID."""

    customer = await database.fetchrow(
        "SELECT customer_id, name, phone FROM customers WHERE customer_id = $1",
        customer_id,
    )

    if not customer:
        return {
            "error": f"No customer found with ID {customer_id}"
        }

    return dict(customer)


async def get_appointment(customer_id: str) -> dict:
    """Look up a customer's upcoming appointment by their customer ID."""

    appointment = await database.fetchrow(
        """SELECT id, customer_id, date, time, status FROM appointments
        WHERE customer_id = $1 AND status = 'scheduled'
        ORDER BY date, time LIMIT 1""",
        customer_id,
    )

    if not appointment:
        return {
            "error": f"No appointment found for customer {customer_id}"
        }

    return dict(appointment)


# 1. CAPTURE LEAD


async def capture_lead(
    name: str,
    email: str,
    company: str,
    requirement: str,
) -> dict:
    """
    Capture an inbound NetKathir customer inquiry.

    Currently stores the lead in mock storage.
    This can later be connected to a database, CRM, or email.
    """

    if not name.strip():
        return {"error": "Name is required."}

    if not email.strip():
        return {"error": "Email is required."}

    if not company.strip():
        return {"error": "Company is required."}

    if not requirement.strip():
        return {"error": "Requirement is required."}

    lead_id = str(await database.fetchval("SELECT COALESCE(MAX(lead_id::int), 0) + 1 FROM leads"))

    lead = {
        "lead_id": lead_id,
        "name": name.strip(),
        "email": email.strip(),
        "company": company.strip(),
        "requirement": requirement.strip(),
        "status": "new",
    }

    await database.execute(
        """INSERT INTO leads (lead_id, name, email, company, requirement, status)
        VALUES ($1, $2, $3, $4, $5, $6)""",
        lead_id, lead["name"], lead["email"], lead["company"], lead["requirement"], lead["status"],
    )

    return {
        "success": True,
        "message": "Lead captured successfully.",
        "lead": lead,
    }



# 2. GET SERVICE INFO


async def get_service_info(service_name: str) -> dict:
    """
    Look up structured information about a NetKathir service.
    """

    service_name_clean = service_name.strip().lower()

    service = await database.fetchrow(
        "SELECT name, description FROM services WHERE LOWER(key) = $1",
        service_name_clean,
    )
    if service:
        return dict(service)

    return {
        "error": f"No service found with name '{service_name}'"
    }



# 3. SCHEDULE CONSULTATION


async def schedule_consultation(
    name: str,
    contact: str,
    preferred_time: str,
    topic: str,
) -> dict:
    """
    Schedule a discovery consultation with the NetKathir team.

    Currently stores the consultation in mock storage.
    """

    if not name.strip():
        return {"error": "Name is required."}

    if not contact.strip():
        return {"error": "Contact information is required."}

    if not preferred_time.strip():
        return {"error": "Preferred time is required."}

    if not topic.strip():
        return {"error": "Consultation topic is required."}

    consultation_id = str(uuid4())

    consultation = {
        "consultation_id": consultation_id,
        "name": name.strip(),
        "contact": contact.strip(),
        "preferred_time": preferred_time.strip(),
        "topic": topic.strip(),
        "status": "requested",
    }

    await database.execute(
        """INSERT INTO consultations
        (consultation_id, name, contact, preferred_time, topic, status)
        VALUES ($1, $2, $3, $4, $5, $6)""",
        consultation_id, consultation["name"], consultation["contact"],
        consultation["preferred_time"], consultation["topic"], consultation["status"],
    )

    return {
        "success": True,
        "message": "Consultation scheduled successfully.",
        "consultation": consultation,
    }



# 4. CHECK CONSULTATION AVAILABILITY


async def check_consultation_availability(
    date_range: str,
) -> dict:
    """
    Return available consultation slots for the requested date range.
    """

    if not date_range.strip():
        return {
            "error": "Date range is required."
        }

    available_slots = [dict(slot) for slot in await database.fetch(
        "SELECT id, date, time, available FROM consultation_slots WHERE available = TRUE AND date ILIKE $1 ORDER BY date, time",
        f"%{date_range.strip()}%",
    )]
    if not available_slots:
        available_slots = [dict(slot) for slot in await database.fetch(
            "SELECT id, date, time, available FROM consultation_slots WHERE available = TRUE ORDER BY date, time"
        )]

    if not available_slots:
        return {
            "success": True,
            "message": "No consultation slots are currently available.",
            "slots": [],
        }

    return {
        "success": True,
        "date_range": date_range,
        "slots": available_slots,
    }



# 5. TRANSFER TO HUMAN

def transfer_to_human() -> dict:
    """
    Escalate the conversation to a human representative.
    """

    return {
        "success": True,
        "status": "human_escalation_requested",
        "message": (
            "The conversation has been marked for human assistance."
        ),
    }



# 6. GET CASE STUDY


async def get_case_study(
    industry_or_service: str,
) -> dict:
    """
    Find a relevant NetKathir case study based on
    an industry or service.
    """

    query = industry_or_service.strip().lower()

    case_study = await database.fetchrow(
        "SELECT name, description FROM case_studies WHERE LOWER(key) LIKE $1 LIMIT 1",
        f"%{query}%",
    )
    if case_study:
        return dict(case_study)

    return {
        "error": (
            f"No matching case study found for "
            f"'{industry_or_service}'"
        )
    }



# 7. FAQ LOOKUP


async def faq_lookup(topic: str) -> dict:
    """
    Look up an answer to a frequently asked NetKathir question.
    """

    query = topic.strip().lower()

    faq = await database.fetchrow(
        "SELECT topic, answer FROM faqs WHERE LOWER(key) LIKE $1 OR $1 LIKE LOWER(key) LIMIT 1",
        f"%{query}%",
    )
    if faq:
        return dict(faq)

    return {
        "error": f"No FAQ found for topic '{topic}'"
    }


# TOOL SCHEMAS


TOOL_SCHEMAS = [

   
    # GET CUSTOMER


    {
        "type": "function",
        "function": {
            "name": "get_customer",
            "description": (
                "Get a customer's basic details "
                "using their customer ID."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": (
                            "The customer's unique ID."
                        ),
                    }
                },
                "required": ["customer_id"],
            },
        },
    },

  
    # GET APPOINTMENT
   

    {
        "type": "function",
        "function": {
            "name": "get_appointment",
            "description": (
                "Get a customer's upcoming appointment "
                "using their customer ID."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {
                        "type": "string",
                        "description": (
                            "The customer's unique ID."
                        ),
                    }
                },
                "required": ["customer_id"],
            },
        },
    },

   
    # CAPTURE LEAD
   
    {
        "type": "function",
        "function": {
            "name": "capture_lead",
            "description": (
                "Capture an inbound NetKathir inquiry "
                "when a visitor wants to get started "
                "or discuss a project."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": (
                            "The visitor's full name."
                        ),
                    },
                    "email": {
                        "type": "string",
                        "description": (
                            "The visitor's email address."
                        ),
                    },
                    "company": {
                        "type": "string",
                        "description": (
                            "The visitor's company name."
                        ),
                    },
                    "requirement": {
                        "type": "string",
                        "description": (
                            "The visitor's project requirement."
                        ),
                    },
                },
                "required": [
                    "name",
                    "email",
                    "company",
                    "requirement",
                ],
            },
        },
    },

  
    # GET SERVICE INFO
    
    {
        "type": "function",
        "function": {
            "name": "get_service_info",
            "description": (
                "Get accurate structured information "
                "about a NetKathir service."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "service_name": {
                        "type": "string",
                        "description": (
                            "The NetKathir service name."
                        ),
                    },
                },
                "required": ["service_name"],
            },
        },
    },


    # SCHEDULE CONSULTATION
  

    {
        "type": "function",
        "function": {
            "name": "schedule_consultation",
            "description": (
                "Schedule a discovery consultation "
                "with the NetKathir sales or technology team."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Customer's name.",
                    },
                    "contact": {
                        "type": "string",
                        "description": (
                            "Customer's email or phone number."
                        ),
                    },
                    "preferred_time": {
                        "type": "string",
                        "description": (
                            "Customer's preferred consultation time."
                        ),
                    },
                    "topic": {
                        "type": "string",
                        "description": (
                            "Topic or requirement to discuss."
                        ),
                    },
                },
                "required": [
                    "name",
                    "contact",
                    "preferred_time",
                    "topic",
                ],
            },
        },
    },

   
    # CHECK CONSULTATION AVAILABILITY
  

    {
        "type": "function",
        "function": {
            "name": "check_consultation_availability",
            "description": (
                "Check available consultation slots "
                "for a requested date range."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "date_range": {
                        "type": "string",
                        "description": (
                            "Requested date or date range."
                        ),
                    },
                },
                "required": ["date_range"],
            },
        },
    },


    # TRANSFER TO HUMAN


    {
        "type": "function",
        "function": {
            "name": "transfer_to_human",
            "description": (
                "Escalate the conversation to a human "
                "representative when human assistance is required."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },

    
    # GET CASE STUDY
    

    {
        "type": "function",
        "function": {
            "name": "get_case_study",
            "description": (
                "Find a relevant NetKathir case study "
                "based on an industry or service."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "industry_or_service": {
                        "type": "string",
                        "description": (
                            "Industry or NetKathir service "
                            "related to the visitor's question."
                        ),
                    },
                },
                "required": ["industry_or_service"],
            },
        },
    },

  
    # FAQ LOOKUP
   

    {
        "type": "function",
        "function": {
            "name": "faq_lookup",
            "description": (
                "Look up accurate answers to common "
                "NetKathir frequently asked questions."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "topic": {
                        "type": "string",
                        "description": (
                            "The FAQ topic or question."
                        ),
                    },
                },
                "required": ["topic"],
            },
        },
    },
]



# AVAILABLE TOOLS


AVAILABLE_TOOLS = {

    "get_customer": get_customer,

    "get_appointment": get_appointment,

    "capture_lead": capture_lead,

    "get_service_info": get_service_info,

    "schedule_consultation": schedule_consultation,

    "check_consultation_availability":
        check_consultation_availability,

    "transfer_to_human":
        transfer_to_human,

    "get_case_study":
        get_case_study,

    "faq_lookup":
        faq_lookup,
}