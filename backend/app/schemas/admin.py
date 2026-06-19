from pydantic import BaseModel
from typing import List

class UserAdminResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}

class UserPaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    users: List[UserAdminResponse]

class UpdateRoleRequest(BaseModel):
    role: str

class UpdateStatusRequest(BaseModel):
    is_active: bool

class ResetPasswordRequest(BaseModel):
    new_password: str

class ChatSessionAdminResponse(BaseModel):
    id: str
    user_id: int
    username: str
    title: str
    created_at: str

class ChatSessionPaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    sessions: List[ChatSessionAdminResponse]

class ChatMessageAdminResponse(BaseModel):
    id: int
    role: str
    content: str
    sources: str | None
    created_at: str

    model_config = {"from_attributes": True}
