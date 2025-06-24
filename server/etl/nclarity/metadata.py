# === Imports and Setup ===
import os
import sys
import json
import uuid
import time
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor
import requests

etl_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if etl_root not in sys.path:
    sys.path.insert(0, etl_root)

from shared_modules.retry_utils import retry_db, retry_request
from shared_modules.crypto_utils import decrypt
from shared_modules.snowflake_utils import (
    get_snowflake_connection,
    use_customer_database,
    fetch_config_from_snowflake,
    ensure_database_exists,
    get_last_pull_timestamp,
    update_last_pull_timestamp,
    create_table_if_missing,
    evolve_schema_if_needed,
    log_etl_run,
)
from shared_modules.email_utils import queue_error_message, send_batched_error_email

# === Environment and Auth ===
load_dotenv()
run_session_id = str(uuid.uuid4())
account_id = sys.argv[1]
connector_id = "nclarity"
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
manual_sync_id = os.getenv("MANUAL_SYNC_ID", None)
is_manual_sync = manual_sync_id is not None

config = fetch_config_from_snowflake(account_id)
source_creds = json.loads(config["SOURCE_CREDENTIALS_VARIANT"])
decrypted_api_key = decrypt(source_creds["apiKey"], ENCRYPTION_KEY)
os.environ["NCLARITY_API_KEY"] = decrypted_api_key
TOKEN = os.getenv("NCLARITY_API_KEY")

for var in ["USERNAME", "HOST", "WAREHOUSE", "ROLE", "AUTH_METHOD"]:
    os.environ[f"SNOWFLAKE_{var}"] = config[var]

auth_method = config["AUTH_METHOD"].lower()
if auth_method == "password":
    os.environ["SNOWFLAKE_PASSWORD"] = decrypt(config["PASSWORD_ENCRYPTED"], ENCRYPTION_KEY)
elif auth_method == "keypair":
    os.environ["SNOWFLAKE_PRIVATE_KEY_BASE64"] = decrypt(config["PRIVATE_KEY_ENCRYPTED"], ENCRYPTION_KEY)
    if config.get("PASSPHRASE_ENCRYPTED"):
        os.environ["SNOWFLAKE_PASSPHRASE"] = decrypt(config["PASSPHRASE_ENCRYPTED"], ENCRYPTION_KEY)
elif auth_method == "oauth":
    os.environ["SNOWFLAKE_OAUTH_TOKEN"] = decrypt(config["OAUTH_ACCESS_TOKEN_ENCRYPTED"], ENCRYPTION_KEY)
    if config.get("OAUTH_REFRESH_TOKEN_ENCRYPTED"):
        os.environ["SNOWFLAKE_OAUTH_REFRESH_TOKEN"] = decrypt(config["OAUTH_REFRESH_TOKEN_ENCRYPTED"], ENCRYPTION_KEY)

TABLE_MERGE_POLICIES = {
    "equipment": "upsert",
    "buildings": "upsert",
    "device": "upsert",
    "status_record": "upsert",
    "equipment_profiles": "upsert",
    "system_profiles": "upsert",
}

def audit_fn(*args, **kwargs):
    kwargs["run_session_id"] = run_session_id
    kwargs["manual_sync_id"] = manual_sync_id
    return log_etl_run(config, account_id, connector_id, *args, **kwargs)

# === Snowflake Utilities ===
@retry_db(retries=3)
def fetch_existing_ids(table_name, id_column="ID"):
    with get_snowflake_connection(config) as conn:
        cs = conn.cursor()
        use_customer_database(cs, connector_name='nclarity')
        cs.execute(f"SELECT {id_column} FROM {table_name}")
        return set(row[0] for row in cs.fetchall())

@retry_db(retries=3)
def delete_stale_records(table_name, live_ids):
    with get_snowflake_connection(config) as conn:
        cs = conn.cursor()
        use_customer_database(cs, connector_name='nclarity')
        existing_ids = fetch_existing_ids(table_name)
        stale_ids = existing_ids - live_ids
        if stale_ids:
            print(f"🧹 Deleting {len(stale_ids)} stale rows from {table_name}")
            id_placeholders = ", ".join([f"'{id_}'" for id_ in stale_ids])
            cs.execute(f"DELETE FROM {table_name} WHERE ID IN ({id_placeholders})")

def get_created_after_filter(table_name):
    last_pull = get_last_pull_timestamp(config, account_id, connector_id, table_name)
    return last_pull.isoformat() + "Z" if last_pull else "2021-01-01T00:00:00Z"

# === Fetch Utilities ===
@retry_request(retries=3)
def fetch_paginated(endpoint, extra_params={}, version="v3"):
    url = f"https://api.nclarity.com/{version}/{endpoint}"
    params = {"limit": 100}
    params.update(extra_params)
    results = []
    while url:
        resp = requests.get(url, headers={"Authorization": f"Bearer {TOKEN}"}, params=params)
        resp.raise_for_status()
        data = resp.json()
        results.extend(data.get("data", []))
        url = data.get("links", {}).get("next")
        params = {}
    return results

def fetch_with_created_after(endpoint, table_name, version="v3", extra_params=None):
    created_after = get_created_after_filter(table_name)
    print(f"📦 Fetching {endpoint} records created after {created_after}")
    params = {"createdAfter": created_after}
    if extra_params:
        params.update(extra_params)
    return fetch_paginated(endpoint, extra_params=params, version=version)

def clean_dict_values(row):
    return {
        k: json.dumps(v) if isinstance(v, dict) else v
        for k, v in row.items()
    }

# === Upload Logic ===
def upload_to_snowflake_batched(
    table_name, records, create_table_fn, evolve_schema_fn,
    audit_fn, merge_policies, batch_size=5000, connection=None
):
    if not records:
        print(f"⚠️ No records to upload for {table_name}")
        return

    ctx = connection or get_snowflake_connection(config)
    cs = ctx.cursor()
    df = pd.DataFrame(records)
    columns = [col.upper() for col in df.columns]
    df.columns = columns
    rows = df[columns].values.tolist()
    rows = [[None if pd.isna(val) else val for val in row] for row in rows]

    use_customer_database(cs, connector_name='nclarity')
    create_table_fn(cs, table_name, df)
    evolve_schema_fn(cs, table_name, df)

    policy = merge_policies.get(table_name.lower(), "upsert")
    if policy == "append":
        placeholders = ', '.join(['%s'] * len(columns))
        insert_sql = f'INSERT INTO {table_name} ({", ".join(columns)}) VALUES ({placeholders})'
        for i in range(0, len(rows), batch_size):
            cs.executemany(insert_sql, rows[i:i + batch_size])
    elif policy == "upsert":
        temp_table = f"{table_name}_TEMP_{uuid.uuid4().hex[:6]}"
        merge_keys = ["ID"]
        cs.execute(f"CREATE OR REPLACE TEMP TABLE {temp_table} AS SELECT * FROM {table_name} WHERE 1=0")
        insert_sql = f"INSERT INTO {temp_table} ({', '.join(columns)}) VALUES ({', '.join(['%s'] * len(columns))})"
        cs.executemany(insert_sql, rows)
        update_clause = ", ".join([f"{col}=S.{col}" for col in columns if col not in merge_keys])
        match_clause = " AND ".join([f"T.{col}=S.{col}" for col in merge_keys])
        merge_sql = f"""
            MERGE INTO {table_name} T
            USING {temp_table} S
            ON {match_clause}
            WHEN MATCHED THEN UPDATE SET {update_clause}
            WHEN NOT MATCHED THEN INSERT ({', '.join(columns)}) VALUES ({', '.join(['S.' + col for col in columns])})
        """
        cs.execute(merge_sql)

    if audit_fn:
        audit_fn(table_name, len(rows), "success")

    cs.close()
    if not connection:
        ctx.close()

# === Main ETL Logic ===
def process_buildings():
    buildings = fetch_with_created_after("buildings", "BUILDINGS")
    print(f"📦 Retrieved {len(buildings)} buildings")
    live_building_ids = {b.get("id") for b in buildings if b.get("id")}
    rows = []
    seen_ids = set()

    for b in buildings:
        bid = b.get("id")
        if bid and bid not in seen_ids:
            flat = {
                k: json.dumps(v) if isinstance(v, (dict, list)) else v
                for k, v in b.items()
            }
            rows.append(flat)
            seen_ids.add(bid)

    upload_to_snowflake_batched("BUILDINGS", rows, create_table_if_missing,
        evolve_schema_fn=evolve_schema_if_needed, audit_fn=audit_fn,
        merge_policies=TABLE_MERGE_POLICIES)
    update_last_pull_timestamp(config, account_id, connector_id, "BUILDINGS", datetime.utcnow().isoformat() + "Z")
    delete_stale_records("BUILDINGS", live_building_ids)

def process_equipment(eq):
    try:
        eid = eq.get("id")
        bid = eq.get("building", {}).get("id")

        if eid and eid not in seen["equipment"]:
            equipment_rows.append(eq)
            seen["equipment"].add(eid)

        for k, store, key in [
            ("device", device_rows, "device"),
            ("statusRecord", status_rows, "status"),
            ("equipmentProfile", equipment_profile_rows, "equipment_profile"),
            ("systemProfile", system_profile_rows, "system_profile"),
        ]:
            val = eq.get(k)
            if val and val.get("id") and val.get("id") not in seen[key]:
                store.append(val)
                seen[key].add(val["id"])

    except Exception as e:
        queue_error_message("ETL Error", f"Error processing equipment {eq.get('id')}: {e}")

# === Entrypoint ===
if __name__ == "__main__":
    print("🚀 Starting nClarity ETL (Metadata Only)...")
    ensure_database_exists(get_snowflake_connection(config), connector_name='nclarity')

    process_buildings()

    equipment_data = fetch_with_created_after(
        "equipment",
        "EQUIPMENT",
        version="v3",
        extra_params={"include": "building,device,statusRecord,equipmentProfile"}
    )
    print(f"📦 Retrieved {len(equipment_data)} equipment records")

    seen = {k: set() for k in [
        "equipment", "device", "status", "equipment_profile", "system_profile"
    ]}
    equipment_rows, device_rows, status_rows = [], [], []
    equipment_profile_rows, system_profile_rows = [], []

    with ThreadPoolExecutor(max_workers=10) as executor:
        executor.map(process_equipment, equipment_data)

    for table_name, rows in [
        ("EQUIPMENT", equipment_rows),
        ("DEVICE", device_rows),
        ("STATUS_RECORD", status_rows),
        ("EQUIPMENT_PROFILE", equipment_profile_rows),
        ("SYSTEM_PROFILES", system_profile_rows),
    ]:
        if not rows:
            continue
        try:
            upload_to_snowflake_batched(table_name, [clean_dict_values(r) for r in rows],
                create_table_fn=create_table_if_missing,
                evolve_schema_fn=evolve_schema_if_needed,
                audit_fn=audit_fn,
                merge_policies=TABLE_MERGE_POLICIES)
            update_last_pull_timestamp(config, account_id, connector_id, table_name, datetime.utcnow().isoformat() + "Z")
        except Exception as e:
            print(f"❌ Failed to upload {table_name}: {e}")
            queue_error_message(f"ETL Upload Error: {table_name}", str(e))

    print("✅ Metadata sync complete.")
    send_batched_error_email()
