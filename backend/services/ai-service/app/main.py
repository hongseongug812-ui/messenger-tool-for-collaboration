"""
AI Service
Handles Gemini AI chatbot integration
Port: 8007
"""
import os
import sys
from fastapi import FastAPI, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
import google.generativeai as genai

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))
from shared.database import connect_db
from shared.auth import get_current_user_id

app = FastAPI(title="AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)


@app.on_event("startup")
async def startup():
    await connect_db()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai"}


@app.post("/ai/chat")
async def ai_chat(
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Chat with AI assistant"""
    prompt = data.get("prompt", "")
    
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")
    
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")
    
    try:
        model = genai.GenerativeModel('gemini-pro')
        response = model.generate_content(prompt)
        
        return {
            "response": response.text,
            "model": "gemini-pro"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")


@app.post("/ai/summarize")
async def summarize(
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Summarize text"""
    text = data.get("text", "")
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")
    
    try:
        model = genai.GenerativeModel('gemini-pro')
        prompt = f"다음 텍스트를 간결하게 요약해주세요:\n\n{text}"
        response = model.generate_content(prompt)
        
        return {
            "summary": response.text,
            "original_length": len(text),
            "summary_length": len(response.text)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")


@app.post("/ai/translate")
async def translate(
    data: dict = Body(...),
    user_id: str = Depends(get_current_user_id)
):
    """Translate text"""
    text = data.get("text", "")
    target_lang = data.get("target_lang", "English")
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=503, detail="AI service not configured")
    
    try:
        model = genai.GenerativeModel('gemini-pro')
        prompt = f"다음 텍스트를 {target_lang}로 번역해주세요. 번역된 텍스트만 출력하세요:\n\n{text}"
        response = model.generate_content(prompt)
        
        return {
            "translation": response.text,
            "target_language": target_lang
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8007, reload=True)
