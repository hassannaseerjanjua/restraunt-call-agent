from sqlalchemy.orm import Session
from .database import engine, SessionLocal, Base
from .models import Menu

# Menu items list as per specification
MENU_ITEMS = [
    {"name": "Zinger Burger", "price": 450.0},
    {"name": "Chicken Burger", "price": 400.0},
    {"name": "Beef Burger", "price": 500.0},
    {"name": "Regular Fries", "price": 200.0},
    {"name": "Loaded Fries", "price": 350.0},
    {"name": "Coke", "price": 100.0},
    {"name": "Pepsi", "price": 100.0},
    {"name": "Zinger Deal", "price": 650.0},
]

def seed_menu(db: Session):
    # Check if we already have menu items
    existing_count = db.query(Menu).count()
    if existing_count > 0:
        print("Database already contains menu items. Skipping seed.")
        return

    print("Seeding database with Karachi Bites menu items...")
    for item in MENU_ITEMS:
        menu_item = Menu(name=item["name"], price=item["price"], is_available=True)
        db.add(menu_item)
    db.commit()
    print("Database seeded successfully.")

def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_menu(db)
    finally:
        db.close()

if __name__ == "__main__":
    main()
