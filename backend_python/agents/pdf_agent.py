import os
import sys
import shutil

class PDFAgent:
    def __init__(self, groq_api_key):
        self._groq_api_key = groq_api_key
        # We store one EnhancedRAGSystem per session
        self.systems = {}
        self.uploaded_files = {}

    def get_system(self, session_id):
        # Lazy load to prevent taking down the backend due to torch/transformers startup delays
        CURRENT_FILE = os.path.abspath(__file__)
        BACKEND_DIR = os.path.dirname(os.path.dirname(CURRENT_FILE))
        PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
        MULTIMODELRAG_DIR = os.path.join(PROJECT_ROOT, "multimodelrag")
        if MULTIMODELRAG_DIR not in sys.path:
            sys.path.append(MULTIMODELRAG_DIR)

        from enhanced_rag_system import EnhancedRAGSystem, EnhancedRAGConfig

        if session_id not in self.systems:
            config = EnhancedRAGConfig(
                embedding_model="sentence-transformers/all-MiniLM-L6-v2",
                groq_model="llama-3.3-70b-versatile",
                groq_vision_model="llama-3.2-11b-vision-preview",
                chunk_size=1200,
                chunk_overlap=150,
                top_k=6,
                use_multiquery=True,
                use_self_rag_validation=True,
                strict_grounding=True,
                temp_dir=f"data/multimodel_temp/{session_id}",
                exports_dir=f"data/multimodel_exports/{session_id}",
                debug=False,
            )
            self.systems[session_id] = EnhancedRAGSystem(config=config, groq_api_key=self._groq_api_key)
        return self.systems[session_id]

    def process_pdf(self, pdf_path, session_id):
        """Process PDF (Compatibility mode)"""
        return self.process_pdf_with_name(pdf_path, session_id, os.path.basename(pdf_path))

    def process_pdf_with_name(self, pdf_path, session_id, original_filename):
        """Process PDF with original filename tracking using EnhancedRAGSystem"""
        try:
            system = self.get_system(session_id)
            # Create a session specific sub-folder for any temporary elements
            result = system.process_document(pdf_path)
            
            if session_id not in self.uploaded_files:
                self.uploaded_files[session_id] = []
            if original_filename not in self.uploaded_files[session_id]:
                self.uploaded_files[session_id].append(original_filename)
            
            return f"✅ PDF '{original_filename}' processed successfully! You can now ask advanced questions about it (including tables and formulas)."
        
        except Exception as e:
            return f"❌ Error processing PDF: {e}"

    def get_uploaded_pdfs(self, session_id):
        """Return list of uploaded PDFs for the session"""
        return self.uploaded_files.get(session_id, [])
        
    def get_response(self, query, session_id):
        """Get response based on PDF content, including markdown for equations and tables.
        
        Returns a dict with:
          - answer (str): main text answer
          - equations (list): structured equation objects with latex/raw_text
          - tables (list): structured table objects with markdown/raw_text
          - sources (list): citation strings
        """
        if session_id not in self.systems:
            return {
                "answer": "⚠️ No PDF uploaded yet. Please upload a PDF first.",
                "equations": [],
                "tables": [],
                "sources": [],
            }
        
        try:
            system = self.systems[session_id]
            
            # Map query intent to mode
            q_lower = query.lower()
            mode = "standard"
            if any(k in q_lower for k in ["explain", "why", "how"]):
                mode = "explanation"
            elif any(k in q_lower for k in ["analyze", "compare", "difference"]):
                mode = "analysis"

            # Query the specialized system
            result = system._query_async(
                user_query=query,
                mode=mode,
                include_sources=True,
                image_mode=False,
            )

            # Return structured dict — frontend handles rendering
            return {
                "answer": result.get("answer", ""),
                "equations": result.get("equations", []),
                "tables": result.get("tables", []),
                "sources": result.get("sources", []),
            }
            
        except Exception as e:
            return {
                "answer": f"❌ Error generating response: {e}",
                "equations": [],
                "tables": [],
                "sources": [],
            }

    def clear_context(self, session_id):
        """Clear the context for a session"""
        if session_id in self.systems:
            del self.systems[session_id]
        
        if session_id in self.uploaded_files:
            del self.uploaded_files[session_id]
            
        temp_dir = f"data/multimodel_temp/{session_id}"
        if os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as e:
                pass
        
        export_dir = f"data/multimodel_exports/{session_id}"
        if os.path.exists(export_dir):
            try:
                shutil.rmtree(export_dir)
            except Exception as e:
                pass