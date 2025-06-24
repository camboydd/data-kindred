import base64
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
from Crypto.Cipher import AES
import os

def decrypt(encrypted_text, encryption_key_hex):
    if not encryption_key_hex:
        raise ValueError("Missing ENCRYPTION_KEY")
    key = bytes.fromhex(encryption_key_hex)
    iv_hex, encrypted_hex = encrypted_text.split(":")
    iv = bytes.fromhex(iv_hex)
    encrypted_bytes = bytes.fromhex(encrypted_hex)
    cipher = AES.new(key, AES.MODE_CBC, iv)
    decrypted = cipher.decrypt(encrypted_bytes)
    padding_length = decrypted[-1]
    return decrypted[:-padding_length].decode("utf-8")

def load_private_key_der_from_base64(env_var_name="SNOWFLAKE_PRIVATE_KEY_BASE64"):
    base64_key = os.getenv(env_var_name)
    if not base64_key:
        raise ValueError(f"Missing {env_var_name}")
    pem_data = base64.b64decode(base64_key)
    private_key = serialization.load_pem_private_key(pem_data, password=None, backend=default_backend())
    return private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
