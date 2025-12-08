import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv
import google.generativeai as genai

# Load .env
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

api_key = os.getenv("GOOGLE_API_KEY")
print(f"Loaded API Key: {api_key[:5]}...{api_key[-5:] if api_key else 'None'}")

if not api_key:
    print("Error: No API Key found.")
    exit(1)

genai.configure(api_key=api_key)

async def test_gen():
    try:
        print("Listing models...")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(m.name)
        
        # Fallback test with a known newer model
        model = genai.GenerativeModel('gemini-2.0-flash')
        print("Sending request to Gemini (gemini-2.0-flash)...")
        response = await model.generate_content_async("Hello")
        print("Response received:", response.text)

    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test_gen())
