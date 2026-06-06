from fastapi                    import FastAPI
from fastapi.middleware.cors    import CORSMiddleware
from contextlib                 import asynccontextmanager
from app.services.ai_logic      import initialize_ai
from app.config                 import settings
from app.api.router             import api_router
from app.db.session             import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager.
    Handles startup events (DB creation, AI initialization) and shutdown events.

    Args:
        app (FastAPI): The FastAPI application instance.
        
    Yields:
        None
    """
    # Create DB tables on startup
    Base.metadata.create_all(bind=engine)
    
    # Startup AI logic
    initialize_ai()
    
    # Initialize global chat engine and attach to app state
    from app.services.chat_engine import create_global_chat_engine
    app.state.chat_engine = create_global_chat_engine()
    
    yield
    # Shutdown logic (clean up if any)
    pass


app = FastAPI(title="Legal Assistant API", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API endpoints
app.include_router(api_router, prefix="/api")

@app.get("/")
def read_root():
    """
    Health check endpoint for the backend API.

    Returns:
        dict: A status dictionary confirming the backend is running.
    """
    return {"status": "ok", "message": "Backend is running!"}