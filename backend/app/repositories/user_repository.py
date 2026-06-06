from typing                         import Optional
from sqlalchemy.orm                 import Session
from app.models.all_models          import User
from app.schemas.auth               import UserRegister
from app.services.auth_service      import get_password_hash

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
    def create(db: Session, user_in: UserRegister) -> User:
        """
        Creates a new user in the database with a hashed password.

        Args:
            db (Session): The database session.
            user_in (UserRegister): The user registration payload containing username and raw password.

        Returns:
            User: The newly created User object.
        """
        new_user = User(
            username=user_in.username,
            hashed_password=get_password_hash(user_in.password)
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
