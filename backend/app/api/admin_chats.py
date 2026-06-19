from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
from app.db.session import get_db
from app.models.all_models import ChatSession, ChatMessage, User
from app.services.auth_service import get_current_admin_user
from app.schemas.admin import ChatSessionPaginatedResponse, ChatSessionAdminResponse, ChatMessageAdminResponse

router = APIRouter(prefix="/admin/chats", tags=["Admin Chats"])

@router.get("/sessions", response_model=ChatSessionPaginatedResponse)
def list_sessions(
    skip: int = 0, 
    limit: int = 20, 
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    total = db.query(ChatSession).count()
    sessions = (
        db.query(ChatSession, User.username)
        .join(User, ChatSession.user_id == User.id)
        .order_by(desc(ChatSession.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )

    items = []
    for session, username in sessions:
        items.append(ChatSessionAdminResponse(
            id=session.id,
            user_id=session.user_id,
            username=username,
            title=session.title,
            created_at=session.created_at.isoformat()
        ))

    return ChatSessionPaginatedResponse(
        total=total,
        page=(skip // limit) + 1 if limit > 0 else 1,
        page_size=limit,
        sessions=items
    )

@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageAdminResponse])
def get_session_messages(
    session_id: str,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at).all()
    return [
        ChatMessageAdminResponse(
            id=m.id,
            role=m.role,
            content=m.content,
            sources=m.sources,
            created_at=m.created_at.isoformat()
        ) for m in messages
    ]

@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    db.delete(session)
    db.commit()
