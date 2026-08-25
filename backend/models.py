import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

class Menu(Base):
    __tablename__ = "menus"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    price = Column(Float, nullable=False)
    is_available = Column(Boolean, default=True)

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    delivery_address = Column(String, nullable=True)
    total_price = Column(Float, default=0.0)
    status = Column(String, default="pending")  # pending, confirmed, cancelled
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    menu_id = Column(Integer, ForeignKey("menus.id"), nullable=False)
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")
    menu = relationship("Menu")

class CallSession(Base):
    __tablename__ = "call_sessions"

    id = Column(String, primary_key=True, index=True) # Unique session ID generated on client or server
    transcript = Column(String, nullable=True)       # JSON string storing conversation log
    recording_url = Column(String, nullable=True)    # Path to audio recording
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
