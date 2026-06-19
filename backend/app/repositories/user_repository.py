from typing                         import Optional
from sqlalchemy.orm                 import Session
from app.models.all_models          import User


class UserRepository:
    """
    Repository for managing User database operations.
    """

    @staticmethod
    def get_by_username(db: Session, username: str) -> Optional[User]:
        """
        Retrieves a user by their username.

        Args:
            db (Session): The database session.
            username (str): The username to search for.

        Returns:
            Optional[User]: The User object if found, otherwise None.
        """
        return db.query(User).filter(User.username == username).first()

    @staticmethod
    def create(db: Session, username: str, hashed_password: str) -> User:
        """
        Creates a new user in the database with a pre-hashed password.

        Args:
            db (Session): The database session.
            username (str): The username of the user.
            hashed_password (str): The pre-hashed password.

        Returns:
            User: The newly created User object.
        """
        new_user = User(
            username=username,
            hashed_password=hashed_password
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user

    @staticmethod
    def get_all_paginated(db: Session, skip: int = 0, limit: int = 20):
        return db.query(User).offset(skip).limit(limit).all()

    @staticmethod
    def count(db: Session) -> int:
        return db.query(User).count()

    @staticmethod
    def update_role(db: Session, user_id: int, role: str) -> Optional[User]:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.role = role
            db.commit()
            db.refresh(user)
        return user

    @staticmethod
    def update_status(db: Session, user_id: int, is_active: bool) -> Optional[User]:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.is_active = is_active
            db.commit()
            db.refresh(user)
        return user

    @staticmethod
    def update_password(db: Session, user_id: int, hashed_password: str) -> Optional[User]:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            user.hashed_password = hashed_password
            db.commit()
            db.refresh(user)
        return user

    @staticmethod
    def delete(db: Session, user_id: int) -> bool:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            db.delete(user)
            db.commit()
            return True
        return False
