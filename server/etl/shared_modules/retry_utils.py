# modules/retry_utils.py
import time
from functools import wraps
import snowflake.connector
import requests

def retry_db(retries=3, delay=2, backoff=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            current_delay = delay
            for attempt in range(1, retries + 1):
                try:
                    return func(*args, **kwargs)
                except (snowflake.connector.errors.OperationalError,
                        snowflake.connector.errors.InterfaceError,
                        BrokenPipeError) as e:
                    if attempt == retries:
                        raise
                    print(f"⚠️ Snowflake retry {attempt} failed: {e}. Retrying in {current_delay}s...")
                    time.sleep(current_delay)
                    current_delay *= backoff
        return wrapper
    return decorator

def retry_request(retries=3, delay=1, backoff=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            current_delay = delay
            for attempt in range(1, retries + 1):
                try:
                    return func(*args, **kwargs)
                except requests.exceptions.RequestException as e:
                    if attempt == retries:
                        raise
                    print(f"⚠️ API retry {attempt} failed: {e}. Retrying in {current_delay}s...")
                    time.sleep(current_delay)
                    current_delay *= backoff
        return wrapper
    return decorator
