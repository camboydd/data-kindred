import os
import uuid
import base64
import pandas as pd
import snowflake.connector
from datetime import datetime
from shared_modules.retry_utils import retry_db
from shared_modules.crypto_utils import decrypt, load_private_key_der_from_base64
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
from threading import Lock
from functools import wraps

_created_tables = set()
_table_creation_lock = Lock()

from queue import Queue

_snowflake_pool = Queue()
MAX_POOL_SIZE = 5

def get_pooled_snowflake_connection(config):
    try:
        if not _snowflake_pool.empty():
            return _snowflake_pool.get()

        return get_snowflake_connection(config)
    except Exception as e:
        raise Exception(f"❌ Could not get pooled Snowflake connection: {e}")

def return_connection_to_pool(conn):
    if _snowflake_pool.qsize() < MAX_POOL_SIZE:
        _snowflake_pool.put(conn)
    else:
        conn.close()

@retry_db(retries=3)
def fetch_config_from_snowflake(account_id, connector_id="nclarity"):
    query = """
        SELECT 
            cc.ACCOUNT_ID,
            cc.CONNECTOR_ID,
            cc.SOURCE_CREDENTIALS_VARIANT,
            sc.HOST,
            sc.USERNAME,
            sc.AUTH_METHOD,
            sc.PASSWORD_ENCRYPTED,
            sc.PRIVATE_KEY_ENCRYPTED,
            sc.PASSPHRASE_ENCRYPTED,
            sc.OAUTH_ACCESS_TOKEN_ENCRYPTED,
            sc.OAUTH_REFRESH_TOKEN_ENCRYPTED,
            sc.WAREHOUSE,
            sc.ROLE
        FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS cc
        JOIN KINDRED.PUBLIC.SNOWFLAKE_CONFIGS sc
            ON cc.ACCOUNT_ID = sc.ACCOUNT_ID
        WHERE cc.CONNECTOR_ID = %s AND cc.ACCOUNT_ID = %s
    """
    try:
        with get_app_snowflake_connection() as conn:
            cs = conn.cursor()
            cs.execute(query, (connector_id, account_id))
            row = cs.fetchone()
            if not row:
                raise Exception(f"No active connector config found for: {connector_id} / {account_id}")
            keys = [col[0] for col in cs.description]
            return dict(zip(keys, row))
    except Exception as e:
        raise Exception(f"Failed to fetch config from Snowflake: {e}")

@retry_db(retries=3)
def get_app_snowflake_connection():
    try:
        b64_key = os.getenv("APP_SNOWFLAKE_PRIVATE_KEY_BASE64")
        if not b64_key:
            raise Exception("Missing APP_SNOWFLAKE_PRIVATE_KEY_BASE64")

        pem_data = base64.b64decode(b64_key)
        private_key_obj = serialization.load_pem_private_key(pem_data, password=None, backend=default_backend())
        private_key_der = private_key_obj.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )

        return snowflake.connector.connect(
            user=os.getenv("APP_SNOWFLAKE_USERNAME"),
            account=os.getenv("APP_SNOWFLAKE_ACCOUNT"),
            role=os.getenv("APP_SNOWFLAKE_ROLE"),
            warehouse=os.getenv("APP_SNOWFLAKE_WAREHOUSE"),
            private_key=private_key_der,
            authenticator="SNOWFLAKE_JWT"
        )
    except Exception as e:
        raise Exception(f"\u274c Error creating app-level Snowflake connection: {e}")

@retry_db()
def get_snowflake_connection(config):
    kwargs = {
        "user": config["USERNAME"],
        "account": config["HOST"],
        "warehouse": config["WAREHOUSE"],
        "role": config["ROLE"],
    }
    method = config["AUTH_METHOD"].lower()
    key = os.getenv("ENCRYPTION_KEY")

    if method == "password":
        kwargs["password"] = decrypt(config["PASSWORD_ENCRYPTED"], key)
    elif method == "keypair":
        kwargs["private_key"] = load_private_key_der_from_base64("SNOWFLAKE_PRIVATE_KEY_BASE64")
        kwargs["authenticator"] = "SNOWFLAKE_JWT"
    elif method == "oauth":
        kwargs["authenticator"] = "oauth"
        kwargs["token"] = decrypt(config["OAUTH_ACCESS_TOKEN_ENCRYPTED"], key)
    return snowflake.connector.connect(**kwargs)

@retry_db()
def use_customer_database(cs, connector_name):
    cs.execute(f"USE DATABASE {connector_name.upper()}")
    cs.execute("USE SCHEMA PUBLIC")

@retry_db()
def ensure_database_exists(user_conn, connector_name):
    try:
        with user_conn.cursor() as cs:
            cs.execute(f"CREATE DATABASE IF NOT EXISTS {connector_name.upper()}")
            cs.execute(f"USE DATABASE {connector_name.upper()}")
            cs.execute("USE SCHEMA PUBLIC")
    except Exception as e:
        raise RuntimeError(f"\u274c Could not ensure database {connector_name.upper()}: {e}")

@retry_db()
def get_last_pull_timestamp(config, account_id, connector_id, table_name):
    try:
        with get_app_snowflake_connection() as conn:
            cs = conn.cursor()
            cs.execute("""
                SELECT LAST_PULL_TIMESTAMP
                FROM KINDRED.PUBLIC.LAST_PULL_TRACKER 
                WHERE ACCOUNT_ID = %s AND CONNECTOR_ID = %s AND TABLE_NAME = %s
            """, (account_id, connector_id, table_name))
            result = cs.fetchone()
            cs.close()
            return result[0] if result else None
    except Exception as e:
        raise RuntimeError(f"\u26a0\ufe0f Failed to get last pull timestamp for {account_id} / {table_name}: {e}")

@retry_db()
def update_last_pull_timestamp(config, account_id, connector_id, table_name, new_timestamp):
    try:
        with get_app_snowflake_connection() as conn:
            cs = conn.cursor()
            cs.execute("""
                MERGE INTO KINDRED.PUBLIC.LAST_PULL_TRACKER tgt
                USING (
                    SELECT %s AS ACCOUNT_ID, %s AS CONNECTOR_ID, %s AS TABLE_NAME, %s AS LAST_PULL_TIMESTAMP
                ) src
                ON tgt.ACCOUNT_ID = src.ACCOUNT_ID
                   AND tgt.CONNECTOR_ID = src.CONNECTOR_ID
                   AND tgt.TABLE_NAME = src.TABLE_NAME
                WHEN MATCHED THEN UPDATE SET LAST_PULL_TIMESTAMP = src.LAST_PULL_TIMESTAMP
                WHEN NOT MATCHED THEN INSERT (ACCOUNT_ID, CONNECTOR_ID, TABLE_NAME, LAST_PULL_TIMESTAMP)
                VALUES (src.ACCOUNT_ID, src.CONNECTOR_ID, src.TABLE_NAME, src.LAST_PULL_TIMESTAMP)
            """, (account_id, connector_id, table_name, new_timestamp))
            cs.close()
            conn.commit()
    except Exception as e:
        raise RuntimeError(f"\u26a0\ufe0f Failed to update last pull timestamp for {account_id} / {table_name}: {e}")

@retry_db()
def log_etl_run(config, account_id, connector_id, table_name, row_count, status, run_session_id, error_message=None, manual_sync_id=None):
    run_id = str(uuid.uuid4())
    started_at = datetime.utcnow()
    completed_at = datetime.utcnow()
    duration_seconds = (completed_at - started_at).total_seconds()

    try:
        with get_app_snowflake_connection() as global_conn:
            cs = global_conn.cursor()
            cs.execute("USE DATABASE KINDRED")
            cs.execute("USE SCHEMA PUBLIC")
            cs.execute("USE ROLE SYSADMIN")
            cs.execute("""
                CREATE TABLE IF NOT EXISTS RUN_LOG (
                    ID STRING PRIMARY KEY,
                    RUN_SESSION_ID STRING,
                    ACCOUNT_ID STRING,
                    CONNECTOR_ID STRING,
                    TABLE_NAME STRING,
                    RUN_TIMESTAMP TIMESTAMP_NTZ,
                    ROW_COUNT NUMBER,
                    STATUS STRING,
                    ERROR_MESSAGE STRING,
                    MANUAL_SYNC_ID STRING,
                    COMPLETED_AT TIMESTAMP_NTZ,
                    DURATION_SECONDS NUMBER
                )
            """)
            cs.execute("""
                INSERT INTO RUN_LOG (
                    ID, RUN_SESSION_ID, ACCOUNT_ID, CONNECTOR_ID, TABLE_NAME,
                    RUN_TIMESTAMP, ROW_COUNT, STATUS, ERROR_MESSAGE,
                    MANUAL_SYNC_ID, COMPLETED_AT, DURATION_SECONDS
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                run_id, run_session_id, account_id, connector_id, table_name,
                started_at, row_count, status, error_message, manual_sync_id,
                completed_at, duration_seconds
            ))
    except Exception as e:
        raise RuntimeError(f"⚠️ Could not log ETL run: {e}")

@retry_db(retries=3)
def create_table_if_missing(cs, table_name, df):
    table_name_upper = table_name.upper()

    # Avoid repeated work: check if already created in this session
    if table_name_upper in _created_tables:
        return

    with _table_creation_lock:
        if table_name_upper in _created_tables:
            return  # Another thread created it while we waited

        try:
            cs.execute(f"SHOW TABLES LIKE '{table_name_upper}'")
            if not cs.fetchall():
                print(f"⚙️ Creating table {table_name_upper} in Snowflake...")
                col_defs = []
                for col in df.columns:
                    col_upper = col.upper()
                    dtype = "VARCHAR"
                    if pd.api.types.is_integer_dtype(df[col]):
                        dtype = "NUMBER"
                    elif pd.api.types.is_float_dtype(df[col]):
                        dtype = "FLOAT"
                    elif pd.api.types.is_datetime64_any_dtype(df[col]):
                        dtype = "TIMESTAMP_NTZ"
                    col_defs.append(f'{col_upper} {dtype}')
                create_stmt = f'CREATE TABLE {table_name_upper} ({", ".join(col_defs)})'
                print(f"📄 Executing SQL:\n{create_stmt}")
                cs.execute(create_stmt)
            else:
                print(f"✅ Table {table_name_upper} already exists.")
        except Exception as e:
            if "already exists" in str(e).lower():
                print(f"⚠️ Table {table_name_upper} already exists (race condition caught).")
            else:
                raise
        finally:
            _created_tables.add(table_name_upper)
            
def get_inferred_type(series):
    if pd.api.types.is_integer_dtype(series):
        return "NUMBER"
    elif pd.api.types.is_float_dtype(series):
        return "FLOAT"
    elif pd.api.types.is_datetime64_any_dtype(series):
        return "TIMESTAMP_NTZ"
    else:
        return "VARCHAR"

def normalize_type(snowflake_type):
    # Normalize Snowflake types for comparison (handles VARCHAR(16777216), etc.)
    return (
        "NUMBER" if "NUMBER" in snowflake_type
        else "FLOAT" if "FLOAT" in snowflake_type
        else "TIMESTAMP_NTZ" if "TIMESTAMP" in snowflake_type
        else "VARCHAR"
    )

def is_safe_widen(existing_type, inferred_type):
    if existing_type == inferred_type:
        return True
    if inferred_type == "VARCHAR":
        return True
    if existing_type == "NUMBER" and inferred_type == "FLOAT":
        return True
    return False

@retry_db(retries=3)
def evolve_schema_if_needed(cs, table_name, df):
    cs.execute(f'DESC TABLE {table_name}')
    schema_rows = cs.fetchall()
    existing_schema = {row[0].upper(): row[1].upper() for row in schema_rows}

    incoming_columns = set()

    for col in df.columns:
        col_upper = col.upper()
        inferred_type = get_inferred_type(df[col])
        incoming_columns.add(col_upper)

        if col_upper not in existing_schema:
            try:
                cs.execute(f'ALTER TABLE {table_name} ADD COLUMN "{col_upper}" {inferred_type}')
                print(f"➕ Added column '{col_upper}' as {inferred_type}")
            except Exception as e:
                print(f"❌ Failed to add column '{col_upper}': {e}")
        else:
            existing_type = normalize_type(existing_schema[col_upper])
            inferred_base = normalize_type(inferred_type)

            if existing_type != inferred_base:
                if is_safe_widen(existing_type, inferred_base):
                    try:
                        cs.execute(f'ALTER TABLE {table_name} ALTER COLUMN "{col_upper}" SET DATA TYPE {inferred_type}')
                        print(f"🔁 Altered column '{col_upper}' from {existing_schema[col_upper]} → {inferred_type}")
                    except Exception as e:
                        print(f"❌ Failed to widen column '{col_upper}' to {inferred_type}: {e}")
                else:
                    print(f"⚠️ Type change detected for '{col_upper}': Snowflake={existing_schema[col_upper]}, Incoming={inferred_type}. No change applied.")
                    cs.execute(
                        """
                        INSERT INTO KINDRED.PUBLIC.SCHEMA_DRIFT_LOGS (TABLE_NAME, COLUMN_NAME, OLD_TYPE, NEW_TYPE, ACTION, DETECTED_AT)
                        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP())
                        """,
                        (table_name.upper(), col_upper, existing_schema[col_upper], inferred_type, "type_mismatch")
                    )

        # Log missing columns (present in Snowflake but not in DataFrame)
    snowflake_columns = set(existing_schema.keys())
    removed_columns = snowflake_columns - incoming_columns

    for removed_col in removed_columns:
        print(f"📉 Column '{removed_col}' is in Snowflake but missing in incoming DataFrame. Logged as removed.")
        try:
            cs.execute(
                """
                INSERT INTO KINDRED.PUBLIC.SCHEMA_DRIFT_LOGS 
                (TABLE_NAME, COLUMN_NAME, OLD_TYPE, NEW_TYPE, ACTION, DETECTED_AT)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP())
                """,
                (
                    table_name.upper(),
                    removed_col,
                    existing_schema[removed_col],
                    None,
                    "column_removed"
                )
            )
        except Exception as e:
            print(f"❌ Failed to log removed column '{removed_col}': {e}")

