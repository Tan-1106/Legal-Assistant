import os
from app.services.ai_logic import initialize_ai
from app.services.rag_pipeline import ingest_documents
from app.services.chat_engine import answer_legal_question

def main():
    # Initialize local LLM and embedding models
    initialize_ai()

    # Step 1: Ingest documents into the vector store index
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    os.makedirs(data_dir, exist_ok=True)
    
    sample_file = os.path.join(data_dir, "sample_data.txt")
    if len(os.listdir(data_dir)) == 0:
        print("Tạo dữ liệu mẫu...")
        with open(sample_file, "w", encoding="utf-8") as f:
            f.write("Theo Điều 1 Luật Kinh doanh bất động sản 2023, kinh doanh bất động sản là việc đầu tư vốn để thực hiện hoạt động xây dựng, mua, nhận chuyển nhượng để bán, chuyển nhượng; cho thuê, cho thuê lại, cho thuê mua bất động sản; thực hiện dịch vụ môi giới bất động sản; dịch vụ sàn giao dịch bất động sản; dịch vụ tư vấn bất động sản hoặc quản lý bất động sản nhằm mục đích sinh lợi.")
            
    print("Bắt đầu ingest tài liệu từ thư mục:", data_dir)
    ingest_documents(data_path=data_dir)
    print("Ingest hoàn tất!\n")
    
    # Step 2: Query the system with a legal question
    question = "Kinh doanh bất động sản là gì?"
    print(f"Câu hỏi: {question}")
    
    result = answer_legal_question(question)    
    print("\n" + "="*50)
    print("CÂU TRẢ LỜI TỪ LLM:")
    print(result["answer"])
    print("="*50)
    
    print("\nNGUỒN THAM KHẢO (SOURCES):")
    for idx, source in enumerate(result["sources"]):
        print(f"[{idx + 1}] Độ tin cậy (Score): {source['score']}")
        print(f"    Nội dung: {source['text'][:150]}...")
        print(f"    Metadata: {source['metadata']}")

if __name__ == "__main__":
    main()
