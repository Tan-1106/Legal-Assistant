import sqlite3
import os
from app.config import settings

def run_migration():
    db_path = settings.DATABASE_URL.replace('sqlite:///', '')
    print(f"Migrating db: {db_path}")
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1 NOT NULL;")
            conn.commit()
            print("Successfully added is_active column to users table.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print("Column is_active already exists.")
            else:
                print(f"Error: {e}")
        conn.close()
    else:
        print("Database file does not exist yet.")

if __name__ == '__main__':
    run_migration()
