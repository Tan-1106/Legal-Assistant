from pydantic import BaseModel
from typing import List, Dict, Any

class ChatRequest(BaseModel):
    """Schema for incoming chat query."""
    question: str

class SourceNode(BaseModel):
    """Schema for reference source node."""
    score: float
    text: str
    metadata: Dict[str, Any]

class ChatResponse(BaseModel):
    """Schema for outgoing chat response."""
    answer: str
    sources: List[SourceNode]
