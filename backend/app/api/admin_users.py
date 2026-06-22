from fastapi                            import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm                     import Session
from app.db.session                     import get_db
from app.models.all_models              import User
from app.services.auth_service          import get_current_admin_user, get_password_hash
from app.repositories.user_repository   import UserRepository
from app.schemas.admin                  import (
    UserPaginatedResponse, UserAdminResponse, 
    UpdateRoleRequest, UpdateStatusRequest, ResetPasswordRequest
)

router = APIRouter(prefix="/admin/users", tags=["Admin Users"])

@router.get("", response_model=UserPaginatedResponse)
def list_users(
    skip: int = 0, 
    limit: int = 20, 
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    users = UserRepository.get_all_paginated(db, skip=skip, limit=limit)
    total = UserRepository.count(db)
    return UserPaginatedResponse(
        total=total,
        page=(skip // limit) + 1 if limit > 0 else 1,
        page_size=limit,
        users=users
    )

@router.put("/{user_id}/role", response_model=UserAdminResponse)
def update_user_role(
    user_id: int, 
    req: UpdateRoleRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    if user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    user = UserRepository.update_role(db, user_id, req.role)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/{user_id}/status", response_model=UserAdminResponse)
def update_user_status(
    user_id: int, 
    req: UpdateStatusRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    if user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
    user = UserRepository.update_status(db, user_id, req.is_active)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/{user_id}/password", response_model=UserAdminResponse)
def reset_user_password(
    user_id: int, 
    req: ResetPasswordRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    hashed = get_password_hash(req.new_password)
    user = UserRepository.update_password(db, user_id, hashed)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int, 
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user)
):
    if user_id == admin_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    success = UserRepository.delete(db, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
