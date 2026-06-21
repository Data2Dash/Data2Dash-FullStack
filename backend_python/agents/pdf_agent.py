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
                groq_model="llama-3.1-8b-instant",
                groq_vision_model="meta-llama/llama-4-scout-17b-16e-instruct",
                chunk_size=1400,       # Wider windows preserve full equation/table sections
                chunk_overlap=250,     # Larger overlap prevents context loss at boundaries
                top_k=8,               # Retrieve more chunks so multi-page tables are included
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
        """Process PDF using two-stage chunked indexing:
        Stage 1: Fast text extraction (user can chat immediately)
        Stage 2: Asset extraction — tables, equations, figures (background)
        """
        try:
            system = self.get_system(session_id)

            # Stage 1: Fast text indexing
            text_result = system.process_document_text_first(pdf_path)

            # Stage 2: Asset extraction (runs synchronously in background thread)
            asset_result = system.process_document_assets()

            if session_id not in self.uploaded_files:
                self.uploaded_files[session_id] = []
            if original_filename not in self.uploaded_files[session_id]:
                self.uploaded_files[session_id].append(original_filename)

            tables_added = asset_result.get("tables_added", 0)
            equations_added = asset_result.get("equations_added", 0)
            figures_added = asset_result.get("figures_added", 0)

            return (
                f"✅ PDF '{original_filename}' processed successfully! "
                f"({text_result.get('num_chunks', 0)} text chunks, "
                f"{equations_added} equations, {tables_added} tables, {figures_added} figures)"
            )

        except Exception as e:
            return f"❌ Error processing PDF: {e}"

    def _recover_session_from_disk(self, session_id):
        """Rebuild an in-memory session after a server restart by reprocessing
        the PDF that still lives on disk under data/uploads/{session_id}/.
        Stage 1 alone (fast) is enough to restore text Q&A immediately."""
        upload_dir = os.path.join("data", "uploads", session_id)
        if not os.path.isdir(upload_dir):
            return
        pdfs = [f for f in os.listdir(upload_dir) if f.lower().endswith(".pdf")]
        if not pdfs:
            return
        pdf_path = os.path.join(upload_dir, pdfs[0])
        print(f"[RECOVER] Rehydrating session {session_id} from {pdfs[0]}")
        system = self.get_system(session_id)
        system.process_document_text_first(pdf_path)   # fast: restores text chat
        try:
            system.process_document_assets()           # restores tables/eq/figures
        except Exception as e:
            print(f"[RECOVER] asset stage failed (text still usable): {e}")
        self.uploaded_files.setdefault(session_id, [])
        if pdfs[0] not in self.uploaded_files[session_id]:
            self.uploaded_files[session_id].append(pdfs[0])

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
        # Brief retry (2.5s max) for race condition where query arrives during startup
        if session_id not in self.systems:
            import time
            for _ in range(5):
                time.sleep(0.5)
                if session_id in self.systems:
                    break
            # Recovery: if the server restarted and wiped memory, the uploaded
            # file still exists on disk — reprocess it so chat keeps working.
            if session_id not in self.systems:
                try:
                    self._recover_session_from_disk(session_id)
                except Exception as rec_err:
                    print(f"[RECOVER] session {session_id} reprocess failed: {rec_err}")
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