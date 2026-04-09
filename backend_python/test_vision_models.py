import os
import base64
from groq import Groq
from PIL import Image
import io

def test_model_vision(api_key, model_name):
    client = Groq(api_key=api_key)
    
    # Create a small red square image
    img = Image.new('RGB', (100, 100), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    base64_image = base64.b64encode(img_byte_arr.getvalue()).decode('utf-8')
    
    try:
        print(f"Testing vision for model: {model_name}")
        chat_completion = client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "What color is this image?"},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}",
                            },
                        },
                    ],
                }
            ],
            model=model_name,
        )
        print(f"SUCCESS! Model {model_name} supports vision.")
        print(f"Response: {chat_completion.choices[0].message.content}")
        return True
    except Exception as e:
        print(f"FAILED for {model_name}: {e}")
        return False

if __name__ == "__main__":
    api_key = "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"
    models_to_test = [
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "groq/compound",
        "qwen/qwen3-32b",
        "llama-3.2-11b-vision-preview" # control
    ]
    
    for model in models_to_test:
        test_model_vision(api_key, model)
        print("-" * 20)
