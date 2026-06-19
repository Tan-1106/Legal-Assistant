import json
from typing                                 import List, Dict
from sqlalchemy.orm                         import Session
from fastapi                                import HTTPException, status
from llama_index.core.retrievers            import AutoMergingRetriever
from app.models.all_models                  import ChatSession, ChatMessage
from app.schemas.session                    import SessionCreate
from app.schemas.chat                       import ChatRequest
from app.repositories.session_repository    import SessionRepository
from app.repositories.message_repository    import MessageRepository
from app.logger                             import get_logger

logger = get_logger(__name__)

class SessionService:
    """
    Service layer handling business logic for chat sessions and conversational messaging.
    """

    @staticmethod
    def create_session(db: Session, user_id: int, session_in: SessionCreate) -> ChatSession:
        """
        Creates a new chat session for a user.

        Args:
            db (Session): The database session.
            user_id (int): The ID of the user requesting session creation.
            session_in (SessionCreate): Payload containing the desired title for the session.

        Returns:
            ChatSession: The newly created ChatSession object.
        """
        session = SessionRepository.create(db, user_id, session_in.title)
        db.commit()
        return session

    @staticmethod
    def list_sessions(db: Session, user_id: int) -> List[ChatSession]:
        """
        Lists all chat sessions belonging to a specific user.

        Args:
            db (Session): The database session.
            user_id (int): The user's ID.

        Returns:
            List[ChatSession]: A list of chat sessions owned by the user.
        """
        return SessionRepository.get_by_user(db, user_id)

    @staticmethod
    def get_session_messages(db: Session, session_id: str, user_id: int) -> List[ChatMessage]:
        """
        Retrieves all messages for a specific chat session, verifying ownership.

        Args:
            db (Session): The database session.
            session_id (str): The ID of the session to fetch messages from.
            user_id (int): The ID of the user attempting to access the messages.

        Returns:
            List[ChatMessage]: A list of all messages in the session.
            
        Raises:
            HTTPException: If the session does not exist or does not belong to the user.
        """
        session = SessionRepository.get_by_id_and_user(db, session_id, user_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat session not found"
            )
        return MessageRepository.get_session_messages(db, session_id)

    @staticmethod
    def delete_all_sessions(db: Session) -> None:
        """
        Deletes all chat sessions from the database.

        Args:
            db (Session): The database session.
        """
        SessionRepository.delete_all(db)

    @staticmethod
    def delete_session(db: Session, session_id: str, user_id: int) -> Dict[str, str]:
        """
        Deletes a specific chat session, verifying ownership first.

        Args:
            db (Session): The database session.
            session_id (str): The ID of the session to delete.
            user_id (int): The ID of the user attempting the deletion.

        Returns:
            Dict[str, str]: A status and message dictionary indicating success.
            
        Raises:
            HTTPException: If the session does not exist or does not belong to the user.
        """
        session = SessionRepository.get_by_id_and_user(db, session_id, user_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat session not found"
            )
        SessionRepository.delete(db, session)
        return {
            "status": "success",
            "message": f"Successfully deleted session '{session_id}'"
        }

    @staticmethod
    def rename_session(db: Session, session_id: str, user_id: int, new_title: str) -> ChatSession:
        """
        Renames a specific chat session, verifying ownership first.

        Args:
            db (Session): The database session.
            session_id (str): The ID of the session to rename.
            user_id (int): The ID of the user attempting the rename.
            new_title (str): The new title for the session.

        Returns:
            ChatSession: The updated ChatSession object.
            
        Raises:
            HTTPException: If the session does not exist or does not belong to the user.
        """
        session = SessionRepository.get_by_id_and_user(db, session_id, user_id)
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat session not found"
            )
        updated_session = SessionRepository.update_title(db, session, new_title)
        db.commit()
        return updated_session

    @staticmethod
    async def process_chat_message(
        db: Session,
        session_id: str,
        user_id: int,
        request: ChatRequest,
        retriever: AutoMergingRetriever
    ):
        """
        Generates an SSE stream for chat response, processing context and saving history.
        All synchronous SQLAlchemy calls are run via run_in_executor to avoid
        blocking or corrupting the async event loop during streaming.
        """
        import asyncio
        loop = asyncio.get_event_loop()

        def _get_session_and_history():
            session = SessionRepository.get_by_id_and_user(db, session_id, user_id)
            if not session:
                return None, []
            history = MessageRepository.get_recent_history(db, session_id, limit=20)
            return session, list(history)

        # 1. Load session + history on thread pool (sync DB ops)
        session, history = await loop.run_in_executor(None, _get_session_and_history)
        if not session:
            yield f"data: {json.dumps({'error': 'Chat session not found'}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
            return

        try:
            # 3. Retrieve source nodes manually to inject IDs
            source_nodes = await retriever.aretrieve(request.question)
            
            context_str = ""
            for i, node in enumerate(source_nodes, 1):
                page = node.metadata.get("page_label") or node.metadata.get("source", "N/A")
                file_name = node.metadata.get("file_name", "Tài liệu")
                context_str += f"\n--- [Nguồn {i} - {file_name} (Trang {page} của PDF)] ---\n{node.text.strip()}\n"

            CUSTOM_SYSTEM_PROMPT = (
                "Bạn là một Luật sư, chuyên gia tư vấn pháp luật Việt Nam vô cùng tận tâm và chuyên nghiệp.\n"
                "Bạn ĐƯỢC CUNG CẤP một cơ sở dữ liệu pháp luật (ngữ cảnh) bên dưới. Hãy đọc kỹ và dùng CHỈ thông tin từ đó để tư vấn cho người dùng.\n"
                "TUYỆT ĐỐI KHÔNG tự bịa ra các Điều luật, Nghị định hay Thông tư không có trong cơ sở dữ liệu.\n"
                "Khi trả lời, hãy nói chuyện tự nhiên như một luật sư với thân chủ. KHÔNG DÙNG các câu như: 'Theo ngữ cảnh được cung cấp', 'Theo cơ sở dữ liệu', 'Tài liệu không nói rõ'. Hãy nói: 'Theo quy định pháp luật hiện hành...'.\n"
                "Nếu trong cơ sở dữ liệu không quy định mức cụ thể, hãy diễn đạt tự nhiên dựa trên phần thông tin có sẵn. Nếu hoàn toàn không có thông tin, hãy nói: 'Rất tiếc, tôi chưa tìm thấy quy định cụ thể về vấn đề này trong hệ thống.'\n"
                "BẠN PHẢI TRẢ VỀ ĐÚNG ĐỊNH DẠNG JSON. KHÔNG BAO GIỜ TRẢ VỀ TEXT THUẦN.\n"
                "Định dạng JSON yêu cầu:\n"
                "{\n"
                '  "answer": "Nội dung câu trả lời của bạn. CHÚ Ý QUAN TRỌNG: Nếu văn bản trích dẫn có số trang in (ví dụ Trang 10) nhưng [Nguồn] là (Trang 14 của PDF), bạn PHẢI nêu số trang của file PDF (tức là Trang 14) để đồng bộ với hệ thống tra cứu! Hãy thêm [ID] của nguồn vào cuối câu (ví dụ: [1][3]).",\n'
                '  "used_sources": [1, 3] // Mảng số nguyên chứa các ID của Nguồn (từ 1 đến N) mà bạn THỰC SỰ đã sử dụng để đưa ra câu trả lời.\n'
                "}\n"
                f"\n=== CƠ SỞ DỮ LIỆU PHÁP LUẬT ===\n{context_str}"
            )

            from llama_index.core.base.llms.types import ChatMessage, MessageRole
            from app.services.ai_logic import LlamaIndexSettings
            import re

            messages = [ChatMessage(role=MessageRole.SYSTEM, content=CUSTOM_SYSTEM_PROMPT)]
            for msg in history:
                role = MessageRole.USER if msg.role == "user" else MessageRole.ASSISTANT
                # We need to ensure history doesn't break the JSON format constraint, but history is just text.
                messages.append(ChatMessage(role=role, content=msg.content))
            messages.append(ChatMessage(role=MessageRole.USER, content=request.question))

            # Log the retrieved text passages
            if source_nodes:
                logger.info("==================================================")
                logger.info(f"📄 [AI Logic] CÁC ĐOẠN VĂN BẢN (CONTEXT CHUNKS) ĐƯỢC GỬI ĐẾN LLM ĐỂ TẠO CÂU TRẢ LỜI:")
                for i, node in enumerate(source_nodes, 1):
                    file_name = node.metadata.get("file_name", "N/A")
                    page_label = node.metadata.get("page_label") or node.metadata.get("source", "N/A")
                    score = node.score if node.score is not None else 0.0
                    logger.info(f"--- Nguồn {i} (File: {file_name}, Trang: {page_label}, Score: {score:.4f}) ---")
                    logger.info(node.text.strip())
                logger.info("==================================================")
            else:
                logger.info("📄 [AI Logic] Không tìm thấy đoạn văn bản context phù hợp nào để gửi đến LLM.")

            # 4. Stream tokens asynchronously
            response_gen = await LlamaIndexSettings.llm.astream_chat(messages)
            
            accumulated_json = ""
            extracted_answer = ""

            def get_incomplete_answer(jstr: str) -> str:
                match = re.search(r'"answer"\s*:\s*"(.*)', jstr, re.DOTALL)
                if not match:
                    return ""
                val = match.group(1)
                
                res = ""
                i = 0
                while i < len(val):
                    if val[i] == '\\':
                        if i + 1 < len(val):
                            if val[i+1] == 'n': res += '\n'
                            elif val[i+1] == '"': res += '"'
                            elif val[i+1] == '\\': res += '\\'
                            elif val[i+1] == 't': res += '\t'
                            else: res += val[i+1]
                            i += 2
                        else:
                            break # incomplete escape
                    elif val[i] == '"':
                        break # end of string!
                    else:
                        res += val[i]
                        i += 1
                return res

            async for chunk in response_gen:
                token = chunk.delta
                if token:
                    accumulated_json += token
                    new_ans = get_incomplete_answer(accumulated_json)
                    if len(new_ans) > len(extracted_answer):
                        delta = new_ans[len(extracted_answer):]
                        extracted_answer = new_ans
                        yield f"data: {json.dumps({'chunk': delta}, ensure_ascii=False)}\n\n"
            
            # Stream finished, save the parsed answer
            final_answer = extracted_answer if extracted_answer else accumulated_json.strip()

            # 5. Extract used_sources and filter
            used_sources = []
            try:
                clean_json = accumulated_json.strip()
                if clean_json.startswith("```json"):
                    clean_json = clean_json[7:]
                if clean_json.endswith("```"):
                    clean_json = clean_json[:-3]
                
                final_data = json.loads(clean_json.strip(), strict=False)
                used_sources = final_data.get("used_sources", [])
                if not isinstance(used_sources, list):
                    used_sources = []
            except Exception as e:
                logger.error(f"Failed to parse final JSON for used_sources: {e}. Attempting regex fallback.")
                import re
                match = re.search(r'"used_sources"\s*:\s*\[(.*?)\]', clean_json, re.DOTALL)
                if match:
                    numbers_str = match.group(1)
                    used_sources = [int(n.strip()) for n in numbers_str.split(',') if n.strip().isdigit()]
                else:
                    # Fallback: keep all sources if JSON is malformed
                    used_sources = [i for i in range(1, len(source_nodes) + 1)]

            filtered_sources = []
            fallback_mode = len(used_sources) == 0
            
            for i, node in enumerate(source_nodes, 1):
                if fallback_mode or i in used_sources or str(i) in used_sources:
                    filtered_sources.append({
                        "score": float(getattr(node, "score", 1.0) or 1.0),
                        "text": node.text if hasattr(node, "text") else getattr(node.node, "text", ""),
                        "metadata": node.metadata if hasattr(node, "metadata") else getattr(node.node, "metadata", {})
                    })
            
            # 6. Persist conversation to DB on thread pool (sync SQLAlchemy ops)
            sources_json = json.dumps(filtered_sources, ensure_ascii=False)
            session_title = session.title
            question_text = request.question

            def _persist_and_update_title():
                MessageRepository.create(db, session_id, "user", question_text)
                MessageRepository.create(db, session_id, "assistant", final_answer, sources_json)
                db.commit()

                # 7. Auto-generate title if still default
                if session_title == "Cuộc trò chuyện mới" or not session_title.strip():
                    try:
                        from llama_index.core import Settings as LlamaIndexSettings
                        prompt = (
                            "Tạo một tiêu đề ngắn gọn (tối đa 6 từ) bằng Tiếng Việt tóm tắt cho câu hỏi sau. "
                            "Không cần giải thích, chỉ trả về đúng tiêu đề.\n"
                            f"Câu hỏi: {question_text}"
                        )
                        # Use sync complete since we're already in a thread
                        ai_title_response = LlamaIndexSettings.llm.complete(prompt)
                        title_candidate = ai_title_response.text.strip().replace('"', '').replace("'", "")
                        if not title_candidate:
                            title_candidate = " ".join(question_text.split()[:6]) + "..."
                        if len(title_candidate) > 40:
                            title_candidate = title_candidate[:37] + "..."
                        SessionRepository.update_title(db, session, title_candidate)
                    except Exception as title_err:
                        logger.warning(f"AI title generation failed: {title_err}")
                        words = question_text.split()
                        title_candidate = " ".join(words[:6])
                        if len(title_candidate) > 40:
                            title_candidate = title_candidate[:37] + "..."
                        SessionRepository.update_title(db, session, title_candidate)
                    db.commit()

            await loop.run_in_executor(None, _persist_and_update_title)

            yield f"data: {json.dumps({'sources': filtered_sources}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        except Exception as e:
            logger.error(f"Error processing chat message: {e}", exc_info=True)
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
