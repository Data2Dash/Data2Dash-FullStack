# 🚀 DATA2DASH - Quick Start Guide

## ⚠️ IMPORTANT: Search Not Working Fix

The search feature isn't working because the backend needs to run with the **virtual environment** that has all the required Python packages installed.

---

## 🔧 How to Fix and Run Properly

### **Step 1: Stop the Current Backend**

First, stop the backend that's currently running (the one started with `python3 main.py`):
- Press `Ctrl+C` in the terminal where it's running
- Or close that terminal window

### **Step 2: Start Backend with Virtual Environment**

**Option A: Using PowerShell Script (Recommended)**
```powershell
.\start_backend.ps1
```

**Option B: Manual Commands**
```powershell
cd backend_python
$env:GROQ_API_KEY = "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"
.\venv\Scripts\python.exe main.py
```

### **Step 3: Verify Backend is Running**

You should see output like:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### **Step 4: Keep Frontend Running**

The frontend should already be running on http://localhost:5173
If not, run:
```bash
npm run dev
```

---

## 🌐 Access the Website

Once both servers are running:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

---

## 🧪 Test the Search Feature

1. Open http://localhost:5173 in your browser
2. Navigate to the "Web Paper Search & Analysis" section
3. Type a search query like "machine learning" or "neural networks"
4. Press Enter or click search
5. Papers from arXiv should appear!

---

## 📋 What Went Wrong?

The issue was:
- ❌ Backend was running with system Python (`python3`)
- ❌ System Python doesn't have the required packages (langchain, groq, etc.)
- ✅ Need to use virtual environment Python (`.\venv\Scripts\python.exe`)
- ✅ Virtual environment has all dependencies installed

---

## 🛑 Stopping the Servers

To stop the servers:
1. Press `Ctrl+C` in each terminal window
2. Or close the terminal windows

---

## 💡 Quick Reference

### Start Backend (PowerShell)
```powershell
cd "c:\Users\user\Desktop\source_code (4)\source_code (4)"
.\start_backend.ps1
```

### Start Frontend
```powershell
cd "c:\Users\user\Desktop\source_code (4)\source_code (4)"
npm run dev
```

### Test Backend Health
```powershell
Invoke-WebRequest -Uri "http://localhost:8000/" -UseBasicParsing
```

---

## 🔑 Environment Variables

The GROQ API key is:
- Hardcoded in `backend_python/main.py` (line 25)
- Also in `backend_python/.env` file
- Set in the start scripts

---

## 📦 Dependencies

### Frontend
- Node.js v22.17.1 ✅
- npm packages installed ✅

### Backend
- Python 3.12.10 ✅
- Virtual environment created ✅
- All packages installed in venv ✅
- GROQ API key configured ✅

---

## 🎯 Next Steps

1. **Stop** the current backend (running with python3)
2. **Start** backend using `.\start_backend.ps1`
3. **Test** the search feature
4. **Enjoy** your AI-powered research platform! 🎉
