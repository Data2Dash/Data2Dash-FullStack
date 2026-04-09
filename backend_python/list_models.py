import os
import requests
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")

url = "https://api.groq.com/openai/v1/models"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

response = requests.get(url, headers=headers)
if response.status_code == 200:
    models = response.json().get('data', [])
    with open('groq_models.txt', 'w') as f:
        for model in models:
            f.write(f"{model['id']}\n")
    print(f"Dumped {len(models)} models to groq_models.txt")
else:
    print(f"Failed to fetch models: {response.status_code}")
    print(response.text)
