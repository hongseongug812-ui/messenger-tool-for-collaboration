"""
Text Encryption Module
Shared across all microservices
"""
import os
import base64
from cryptography.fernet import Fernet

# Encryption key from environment  
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

# Generate a key if not provided (for development)
if not ENCRYPTION_KEY:
    ENCRYPTION_KEY = Fernet.generate_key().decode()
    print(f"[Encryption] Generated new key: {ENCRYPTION_KEY[:20]}...")

# Ensure key is properly formatted
try:
    if len(ENCRYPTION_KEY) == 32:
        # Raw 32-byte key - encode to base64
        ENCRYPTION_KEY = base64.urlsafe_b64encode(ENCRYPTION_KEY.encode()).decode()
    fernet = Fernet(ENCRYPTION_KEY.encode() if isinstance(ENCRYPTION_KEY, str) else ENCRYPTION_KEY)
except Exception as e:
    print(f"[Encryption] Key error, generating new: {e}")
    ENCRYPTION_KEY = Fernet.generate_key()
    fernet = Fernet(ENCRYPTION_KEY)


def encrypt_text(text: str) -> str:
    """Encrypt text and return base64 encoded string"""
    if not text:
        return text
    try:
        encrypted = fernet.encrypt(text.encode())
        return encrypted.decode()
    except Exception as e:
        print(f"[Encryption] Encrypt error: {e}")
        return text


def decrypt_text(encrypted_text: str) -> str:
    """Decrypt base64 encoded encrypted string"""
    if not encrypted_text:
        return encrypted_text
    try:
        decrypted = fernet.decrypt(encrypted_text.encode())
        return decrypted.decode()
    except Exception as e:
        # Return original if can't decrypt (might be plain text)
        return encrypted_text
