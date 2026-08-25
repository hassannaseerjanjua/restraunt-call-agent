Read the file:

AI_Restaurant_Voice_Agent_Demo_Spec.md

First understand the requirements, then build ONLY the core working MVP.

IMPORTANT:
Do not spend a long time planning or explaining. Start implementation after a quick repository inspection.

STACK:

- Frontend: React + TypeScript + Vite + Tailwind
- Backend: Python + FastAPI
- Database: PostgreSQL + SQLAlchemy + Alembic
- Voice: OpenAI Realtime API

CORE DEMO:

Browser
↓
Microphone
↓
Realtime AI Voice Agent
↓
Pakistani Urdu / Urdu-English conversation
↓
Menu Tool Calling
↓
Collect Order
↓
Confirm Order
↓
PostgreSQL
↓
Restaurant Dashboard

MUST WORK:

1. Actual microphone voice input
2. Actual AI voice output
3. Natural Urdu/Urdu-English conversation
4. Real-time interruption / barge-in
5. Menu lookup through backend tools
6. Backend-calculated prices and totals
7. Customer information collection
8. Delivery address collection
9. Explicit order confirmation
10. Real order creation in PostgreSQL
11. Orders dashboard
12. Call transcript
13. Call history
14. Basic call recording if technically possible

DEMO RESTAURANT:

Karachi Bites

Use a small PostgreSQL menu with:

- Zinger Burger — Rs. 450
- Chicken Burger — Rs. 400
- Beef Burger — Rs. 500
- Regular Fries — Rs. 200
- Loaded Fries — Rs. 350
- Coke — Rs. 100
- Pepsi — Rs. 100
- Zinger Deal — Rs. 650

IMPORTANT AI RULES:

- Never invent menu items
- Never invent prices
- Never calculate totals itself
- Use backend tools for menu/order information
- Never create an order without customer confirmation
- Speak naturally in Pakistani Urdu/Urdu-English
- Handle interruptions immediately
- Never expose API keys

DO NOT BUILD YET:

- Phone/SIM integration
- SIP integration
- Billing/subscriptions
- Multi-restaurant SaaS
- Redis/Celery
- Advanced analytics
- Complex admin settings

Keep the architecture clean so phone/SIP integration can be added later.

IMPLEMENTATION PRIORITY:

1. FastAPI backend
2. PostgreSQL models + migration
3. Karachi Bites seed data
4. Menu/order APIs
5. OpenAI Realtime voice
6. Tool calling
7. Interruption handling
8. React voice UI
9. Orders dashboard
10. Transcript/call history
11. Test complete flow

Do NOT create mock/fake functionality.

Do NOT spend excessive time explaining the architecture.

Build the MVP first.

When finished, only provide:

- What was built
- How to run it
- Required environment variables
- Any actual limitations/errors
