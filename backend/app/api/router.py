from fastapi                import APIRouter
from app.api.auth           import router as auth_router
from app.api.sessions       import router as session_router
from app.api.documents      import router as documents_router
from app.api.admin_users    import router as admin_users_router
from app.api.admin_chats    import router as admin_chats_router

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(session_router)
api_router.include_router(documents_router)
api_router.include_router(admin_users_router)
api_router.include_router(admin_chats_router)
