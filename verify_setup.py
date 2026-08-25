import sys
import os

# Add root folder to sys.path so we can import backend module
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

try:
    from backend.database import engine, SessionLocal, Base
    from backend.models import Menu
    from backend.seed import seed_menu
    
    print("Imports successful!")
    
    # Create the tables
    Base.metadata.create_all(bind=engine)
    print("Database tables created!")
    
    # Seed the database
    db = SessionLocal()
    seed_menu(db)
    
    menu_count = db.query(Menu).count()
    print(f"Connection successful! Menu items count in database: {menu_count}")
    
    if menu_count > 0:
        print("Menu items in database:")
        for item in db.query(Menu).all():
            print(f"- {item.name}: Rs. {item.price:.0f}")
    
    db.close()
    print("Database verification passed successfully!")
    sys.exit(0)
except Exception as e:
    print(f"Error during verification: {e}")
    sys.exit(1)
