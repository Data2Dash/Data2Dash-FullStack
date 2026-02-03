import requests
import json

# Test the search endpoint
url = "http://localhost:8000/api/papers/search"
data = {"query": "machine learning"}

try:
    response = requests.post(url, json=data)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
