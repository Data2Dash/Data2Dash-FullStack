import uvicorn
import os
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())

from main import app

if __name__ == "__main__":
    print("Starting Uvicorn server on http://127.0.0.1:8000 ...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
