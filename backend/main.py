import os
from dotenv import load_dotenv

# Load environment variables relative to this file's directory
dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=dotenv_path)

import json
import uuid
import datetime
from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy.orm import Session
import httpx

from backend.database import engine, Base, get_db, SessionLocal
from backend.models import Menu, Order, OrderItem, CallSession
from backend.seed import seed_menu

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
if not GEMINI_API_KEY:
    print("WARNING: GEMINI_API_KEY is not set. The voice agent will return mock responses.")



# Create database tables
Base.metadata.create_all(bind=engine)

# Auto-seed the database
db = SessionLocal()
try:
    seed_menu(db)
finally:
    db.close()

# Ensure recordings directory exists
RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), "recordings")
os.makedirs(RECORDINGS_DIR, exist_ok=True)

app = FastAPI(title="Karachi Bites Voice Agent API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount recordings folder static files
app.mount("/api/recordings", StaticFiles(directory=RECORDINGS_DIR), name="recordings")

# --- DATABASE TOOL FUNCTIONS ---

def get_menu(query: str = None) -> str:
    """Get the restaurant menu. Can filter by a query term.
    
    Args:
        query: Optional search keyword to filter menu items (e.g. 'burger', 'fries').
    """
    db = SessionLocal()
    try:
        q = db.query(Menu).filter(Menu.is_available == True)
        if query:
            q = q.filter(Menu.name.ilike(f"%{query}%"))
        items = q.all()
        if not items:
            return "No items found in the menu matching your query."
        
        result = "Karachi Bites Menu:\n"
        for item in items:
            result += f"- {item.name}: Rs. {item.price:.0f}\n"
        return result
    finally:
        db.close()

def calculate_order_price(items: list[dict]) -> str:
    """Calculate the total price for a list of items and quantities.
    
    Args:
        items: List of dictionaries, where each dict has 'name' (str) and 'quantity' (int).
               Example: [{"name": "Zinger Burger", "quantity": 2}, {"name": "Coke", "quantity": 1}]
    """
    db = SessionLocal()
    try:
        detailed_items = []
        total = 0.0
        for item in items:
            name = item.get("name")
            qty = item.get("quantity", 1)
            # Find in DB
            db_item = db.query(Menu).filter(Menu.name.ilike(name)).first()
            if not db_item:
                return f"Error: Menu item '{name}' was not found. Please check spelling."
            
            subtotal = db_item.price * qty
            total += subtotal
            detailed_items.append(f"{qty}x {db_item.name} (Rs. {db_item.price:.0f} each) = Rs. {subtotal:.0f}")
        
        result = "Order Calculation:\n" + "\n".join(detailed_items)
        result += f"\nTotal Bill: Rs. {total:.0f}"
        return result
    finally:
        db.close()

def create_order(customer_name: str, customer_phone: str, delivery_address: str, items: list[dict], confirm: bool) -> str:
    """Create a new customer order in the database.
    
    Args:
        customer_name: Customer's name.
        customer_phone: Customer's phone number.
        delivery_address: Customer's delivery address.
        items: List of dictionaries containing 'name' (str) and 'quantity' (int).
        confirm: Must be True. Explicit confirmation from the customer is required to set this to True.
    """
    if not confirm:
        return "Error: Order cannot be placed without explicit confirmation from the customer. Please ask the customer if they want to confirm."
    
    db = SessionLocal()
    try:
        # Calculate total and verify items
        total = 0.0
        order_items_to_create = []
        for item in items:
            name = item.get("name")
            qty = item.get("quantity", 1)
            db_item = db.query(Menu).filter(Menu.name.ilike(name)).first()
            if not db_item:
                return f"Error: Menu item '{name}' was not found. Order cancelled."
            
            subtotal = db_item.price * qty
            total += subtotal
            order_items_to_create.append((db_item.id, qty, db_item.price))
        
        # Create order
        new_order = Order(
            customer_name=customer_name,
            customer_phone=customer_phone,
            delivery_address=delivery_address,
            total_price=total,
            status="confirmed"
        )
        db.add(new_order)
        db.commit()
        db.refresh(new_order)
        
        # Create order items
        for menu_id, qty, price in order_items_to_create:
            order_item = OrderItem(
                order_id=new_order.id,
                menu_id=menu_id,
                quantity=qty,
                unit_price=price
            )
            db.add(order_item)
        db.commit()
        
        return f"Success: Order #{new_order.id} has been created for {customer_name}. Total bill is Rs. {total:.0f}."
    except Exception as e:
        db.rollback()
        return f"Error: Failed to create order: {str(e)}"
    finally:
        db.close()

# --- GEMINI REST API DECLARATIONS ---

GET_MENU_DECLARATION = {
    "name": "get_menu",
    "description": "Get the restaurant menu. Can filter by a query term.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "query": {
                "type": "STRING",
                "description": "Optional search keyword to filter menu items (e.g. 'burger', 'fries')."
            }
        }
    }
}

CALCULATE_ORDER_PRICE_DECLARATION = {
    "name": "calculate_order_price",
    "description": "Calculate the total price for a list of items and quantities.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "items": {
                "type": "ARRAY",
                "description": "List of dictionaries, where each dict has 'name' (str) and 'quantity' (int).",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {
                            "type": "STRING",
                            "description": "The menu item name."
                        },
                        "quantity": {
                            "type": "INTEGER",
                            "description": "The quantity ordered."
                        }
                    },
                    "required": ["name", "quantity"]
                }
            }
        },
        "required": ["items"]
    }
}

CREATE_ORDER_DECLARATION = {
    "name": "create_order",
    "description": "Create a new customer order in the database.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "customer_name": {
                "type": "STRING",
                "description": "Customer's name."
            },
            "customer_phone": {
                "type": "STRING",
                "description": "Customer's phone number."
            },
            "delivery_address": {
                "type": "STRING",
                "description": "Customer's delivery address."
            },
            "items": {
                "type": "ARRAY",
                "description": "List of dictionaries containing 'name' (str) and 'quantity' (int).",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {
                            "type": "STRING"
                        },
                        "quantity": {
                            "type": "INTEGER"
                        }
                    },
                    "required": ["name", "quantity"]
                }
            },
            "confirm": {
                "type": "BOOLEAN",
                "description": "Must be True. Explicit confirmation from the customer is required to set this to True."
            }
        },
        "required": ["customer_name", "customer_phone", "delivery_address", "items", "confirm"]
    }
}

SYSTEM_INSTRUCTION = """
You are "Baji", the friendly, natural Pakistani female voice assistant for the restaurant "Karachi Bites".
Your job is to take customer food orders.

Rules of Engagement:
1. Speak in natural Pakistani Urdu (using standard Urdu script in your final text replies) or a natural Urdu-English mix (Roman Urdu / Urdu script). Since you are a voice agent, output your response in Urdu script (e.g. "السلام علیکم! کراچی بائٹس میں خوش آمدید۔") so it is read out loud by the voice synthesis engine.
2. NEVER invent menu items or prices. Use the 'get_menu' tool to check what is available and their prices.
3. NEVER calculate order totals yourself. Use the 'calculate_order_price' tool to calculate order price.
4. You must collect the following details before creating an order:
   - Customer's name
   - Customer's phone number
   - Delivery address
5. Once you have all the items, call 'calculate_order_price'. Then summarize the order for the customer: list all items, quantities, the calculated total bill, and the delivery details. Ask them explicitly: "Kya main aap ka order confirm kar doon?" (or in Urdu script: "کیا میں آپ کا آرڈر کنفرم کر دوں؟").
6. ONLY call 'create_order' with confirm=True AFTER the customer explicitly confirms the order. If they say no or want to modify it, do NOT call 'create_order'.
7. Keep your responses short and conversational, as you are a voice agent. Long paragraphs are hard to listen to.
"""

# --- PYDANTIC SCHEMAS ---

class ChatRequest(BaseModel):
    session_id: str
    message: str

class ChatResponse(BaseModel):
    reply: str
    transcript: list

# --- HELPER FUNCTIONS FOR REST GEMINI LOOP ---

FALLBACK_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite-preview", "gemini-3.5-flash"]

async def run_gemini_loop(contents: list, system_instruction: str) -> str:
    key = os.getenv("GEMINI_API_KEY") or GEMINI_API_KEY
    configured_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    models_to_try = [configured_model] + [m for m in FALLBACK_MODELS if m != configured_model]
    
    payload = {
        "contents": contents,
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "tools": [
            {
                "functionDeclarations": [
                    GET_MENU_DECLARATION,
                    CALCULATE_ORDER_PRICE_DECLARATION,
                    CREATE_ORDER_DECLARATION
                ]
            }
        ]
    }
    
    data = None
    last_error = None
    for model in models_to_try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, json=payload, timeout=25.0)
                if response.status_code == 200:
                    data = response.json()
                    break
                elif response.status_code in [429, 404, 503]:
                    print(f"Model {model} returned status {response.status_code}, trying fallback model...")
                    last_error = f"Model {model} error: {response.text}"
                    continue
                else:
                    print(f"Gemini API Error [{response.status_code}]: {response.text}")
                    raise HTTPException(status_code=response.status_code, detail=f"Gemini API returned error: {response.text}")
            except httpx.TimeoutException:
                print(f"Model {model} timed out, trying fallback...")
                continue
            except Exception as e:
                if isinstance(e, HTTPException):
                    raise e
                print(f"Model {model} request failed: {e}")
                last_error = str(e)
                continue
                
    if not data:
        raise HTTPException(status_code=500, detail=f"All Gemini models failed: {last_error}")

        
    candidates = data.get("candidates", [])
    if not candidates:
        raise HTTPException(status_code=500, detail="Gemini returned no response candidates.")
        
    content = candidates[0].get("content", {})
    parts = content.get("parts", [])
    
    # Check for function calls
    function_calls = [p.get("functionCall") for p in parts if p.get("functionCall")]
    
    if function_calls:
        # 1. Add model's tool request to our contents log
        contents.append(content)
        
        # 2. Execute local DB tools and assemble function response parts
        response_parts = []
        for fc in function_calls:
            name = fc.get("name")
            args = fc.get("args", {})
            
            if name == "get_menu":
                result = get_menu(query=args.get("query"))
            elif name == "calculate_order_price":
                result = calculate_order_price(items=args.get("items", []))
            elif name == "create_order":
                result = create_order(
                    customer_name=args.get("customer_name"),
                    customer_phone=args.get("customer_phone"),
                    delivery_address=args.get("delivery_address"),
                    items=args.get("items", []),
                    confirm=args.get("confirm", False)
                )
            else:
                result = f"Error: Function {name} not found."
                
            response_parts.append({
                "functionResponse": {
                    "name": name,
                    "response": {"output": result}
                }
            })
            
        # 3. Add function responses to contents
        contents.append({
            "role": "user",
            "parts": response_parts
        })
        
        # 4. Loop back recursively
        return await run_gemini_loop(contents, system_instruction)
    else:
        # No more function calls, add model's final reply to contents log and return it
        contents.append(content)
        text_replies = [p.get("text") for p in parts if p.get("text")]
        return " ".join(text_replies)

# --- API ENDPOINTS ---

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    # 1. Fetch or create call session
    session = db.query(CallSession).filter(CallSession.id == request.session_id).first()
    if not session:
        session = CallSession(id=request.session_id, transcript="[]")
        db.add(session)
        db.commit()
        db.refresh(session)
        
    # 2. Parse existing contents history
    try:
        contents = json.loads(session.transcript) if session.transcript else []
    except Exception:
        contents = []
        
    # 3. Append the new user message
    contents.append({
        "role": "user",
        "parts": [{"text": request.message}]
    })
    
    # 4. Check if GEMINI_API_KEY is configured
    current_key = os.getenv("GEMINI_API_KEY") or GEMINI_API_KEY
    if not current_key:
        # Try reloading .env in case it was created while running
        load_dotenv(dotenv_path=dotenv_path, override=True)
        current_key = os.getenv("GEMINI_API_KEY")

    if not current_key:
        reply = "السلام علیکم! کراچی بائٹس میں خوش آمدید۔ (Demo Mode - Please set GEMINI_API_KEY in backend/.env for active AI Voice Agent)"
        contents.append({
            "role": "model",
            "parts": [{"text": reply}]
        })
        session.transcript = json.dumps(contents)
        db.commit()
        return ChatResponse(reply=reply, transcript=contents)
        
    try:
        # 5. Run the Gemini loop
        reply = await run_gemini_loop(contents, SYSTEM_INSTRUCTION)
        
        # 6. Save updated contents history to DB
        session.transcript = json.dumps(contents)
        db.commit()
        
        return ChatResponse(reply=reply, transcript=contents)
    except Exception as e:
        print(f"Error calling Gemini: {str(e)}")
        error_reply = "معذرت، مجھے اس وقت آرڈر پروسیس کرنے میں کچھ مسئلہ ہو رہا ہے۔ کیا آپ دوبارہ کہہ سکتے ہیں؟"
        contents.append({
            "role": "model",
            "parts": [{"text": error_reply}]
        })
        session.transcript = json.dumps(contents)
        db.commit()
        return ChatResponse(reply=error_reply, transcript=contents)

@app.get("/api/menu")
async def get_menu_endpoint(db: Session = Depends(get_db)):
    items = db.query(Menu).all()
    return items

@app.get("/api/orders")
async def get_orders_endpoint(db: Session = Depends(get_db)):
    orders = db.query(Order).order_by(Order.created_at.desc()).all()
    result = []
    for order in orders:
        items = []
        for item in order.items:
            items.append({
                "id": item.id,
                "name": item.menu.name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "subtotal": item.quantity * item.unit_price
            })
        result.append({
            "id": order.id,
            "customer_name": order.customer_name,
            "customer_phone": order.customer_phone,
            "delivery_address": order.delivery_address,
            "total_price": order.total_price,
            "status": order.status,
            "created_at": order.created_at,
            "items": items
        })
    return result

@app.get("/api/calls")
async def get_calls_endpoint(db: Session = Depends(get_db)):
    sessions = db.query(CallSession).order_by(CallSession.created_at.desc()).all()
    result = []
    for s in sessions:
        try:
            transcript_list = json.loads(s.transcript) if s.transcript else []
        except Exception:
            transcript_list = []
        result.append({
            "id": s.id,
            "transcript": transcript_list,
            "recording_url": s.recording_url,
            "created_at": s.created_at
        })
    return result

@app.post("/api/calls/{call_id}/recording")
async def upload_recording(call_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    session = db.query(CallSession).filter(CallSession.id == call_id).first()
    if not session:
        session = CallSession(id=call_id, transcript="[]")
        db.add(session)
        db.commit()
        db.refresh(session)
        
    filename = f"{call_id}_{int(datetime.datetime.utcnow().timestamp())}.webm"
    file_path = os.path.join(RECORDINGS_DIR, filename)
    
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
            
        recording_url = f"/api/recordings/{filename}"
        session.recording_url = recording_url
        db.commit()
        
        return {"status": "success", "recording_url": recording_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save recording: {str(e)}")

@app.get("/api/tts")
async def tts_endpoint(text: str = Query(...)):
    # 1. Clean the text (remove markdown symbols)
    cleaned_text = text.replace("*", "").replace("#", "").replace("_", "").replace("`", "").strip()
    if not cleaned_text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
        
    # 2. Hash the text for caching
    import hashlib
    hash_object = hashlib.md5(cleaned_text.encode('utf-8'))
    hash_str = hash_object.hexdigest()
    
    # 3. Cache directory
    tts_dir = os.path.join(RECORDINGS_DIR, "tts")
    os.makedirs(tts_dir, exist_ok=True)
    file_path = os.path.join(tts_dir, f"{hash_str}.mp3")
    
    # 4. Generate TTS if not cached
    if not os.path.exists(file_path):
        try:
            from gtts import gTTS
            tts = gTTS(text=cleaned_text, lang='ur')
            tts.save(file_path)
        except Exception as e:
            print(f"Error generating TTS: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to generate TTS: {str(e)}")
            
    # 5. Return MP3 response
    from fastapi.responses import FileResponse
    return FileResponse(file_path, media_type="audio/mpeg")

