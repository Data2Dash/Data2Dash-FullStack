import os
import fitz  # PyMuPDF
import base64
from groq import Groq
from PIL import Image
import io

class VisionAgent:
    def __init__(self, groq_api_key):
        self.client = Groq(api_key=groq_api_key)
        self.model = "meta-llama/llama-4-scout-17b-16e-instruct"

    def extract_figures(self, pdf_path, session_id):
        """
        Extract images from PDF and save them to a session and paper-specific directory.
        Returns a list of local paths to the extracted figures.
        """
        filename_no_ext = os.path.splitext(os.path.basename(pdf_path))[0]
        figures_dir = os.path.join("data", "uploads", session_id, "figures", filename_no_ext)
        os.makedirs(figures_dir, exist_ok=True)
        
        # Skip if already extracted for this specific paper
        if os.path.exists(figures_dir) and any(f.startswith("figure_") for f in os.listdir(figures_dir)):
            print(f"DEBUG: Figures already extracted for {pdf_path} in {figures_dir}. Skipping.")
            return [os.path.join(figures_dir, f) for f in os.listdir(figures_dir) if f.startswith("figure_")]
        
        print(f"DEBUG: Starting figure extraction for PDF: {pdf_path}")
        
        if not os.path.exists(pdf_path):
            print(f"DEBUG ERROR: PDF path does not exist: {pdf_path}")
            return []

        try:
            doc = fitz.open(pdf_path)
            print(f"DEBUG: PDF opened successfully. Total pages: {len(doc)}")
        except Exception as e:
            print(f"DEBUG ERROR: Failed to open PDF {pdf_path}: {e}")
            return []

        figure_paths = []
        image_count = 0
        
        for i in range(len(doc)):
            page = doc[i]
            images = page.get_images(full=True)
            
            if images:
                print(f"DEBUG: Page {i+1} has {len(images)} potential images.")
            
            for img in images:
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                
                # Filter by byte size and dimensions
                # Real diagrams can sometimes be quite small in file size or dimensions
                if len(image_bytes) < 1000:
                    continue
                
                try:
                    img_data = Image.open(io.BytesIO(image_bytes))
                    width, height = img_data.size
                    # Filter out tiny logos/icons/lines
                    if width < 20 or height < 20:
                        continue
                except:
                    continue
                    
                image_count += 1
                image_ext = base_image["ext"]
                image_filename = f"figure_p{i+1}_{image_count}.{image_ext}"
                image_path = os.path.join(figures_dir, image_filename)
                
                with open(image_path, "wb") as f:
                    f.write(image_bytes)
                
                print(f"DEBUG: Extracted qualifying image {image_count} ({width}x{height}) on page {i+1}")
                figure_paths.append(image_path)
        
        print(f"DEBUG: Extraction complete. Found {len(figure_paths)} qualifying figures.")
        return figure_paths

    def encode_image(self, image_path):
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode('utf-8')

    async def analyze_figure(self, image_path, user_query=None):
        """
        Analyze an image using Groq's Vision model.
        If no query is provided, it gives a general explanation.
        """
        base64_image = self.encode_image(image_path)
        
        # Determine MIME type
        ext = os.path.splitext(image_path)[1].lower().replace('.', '')
        if ext == 'jpg': ext = 'jpeg'
        mime_type = f"image/{ext}" if ext in ['png', 'jpeg', 'gif', 'webp'] else "image/jpeg"
        
        prompt = user_query if user_query else "Explain this figure or image from a research paper in detail. What are the key findings or data points shown?"
        
        try:
            chat_completion = self.client.chat.completions.create(
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{base64_image}",
                                },
                            },
                        ],
                    }
                ],
                model=self.model,
            )
            
            return chat_completion.choices[0].message.content
        except Exception as e:
            print(f"DEBUG ERROR: Vision model failed: {e}")
            return "Vision models are currently unavailable on this platform (model decommissioned). Unfortunately, I cannot visually analyze this figure at the moment. Please refer to the text in the paper describing this figure."
