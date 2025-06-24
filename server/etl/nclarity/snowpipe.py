import os
import sys
import json
import uuid
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv
import requests
import httpx
import asyncio
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

etl_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if etl_root not in sys.path:
    sys.path.insert(0, etl_root)

from shared_modules.retry_utils import retry_request
from shared_modules.crypto_utils import decrypt
from shared_modules.snowflake_utils import (
    fetch_config_from_snowflake,
    get_snowflake_connection,
    use_customer_database
)
from shared_modules.email_utils import queue_error_message, send_batched_error_email

load_dotenv()

account_id = sys.argv[1]
connector_id = "nclarity"
run_session_id = str(uuid.uuid4())

config = fetch_config_from_snowflake(account_id)
source_creds_raw = config["SOURCE_CREDENTIALS_VARIANT"]
source_creds = json.loads(source_creds_raw) if isinstance(source_creds_raw, str) else source_creds_raw

ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
api_key = decrypt(source_creds["apiKey"], ENCRYPTION_KEY)
os.environ["NCLARITY_API_KEY"] = api_key
BASE_URL = "https://api.nclarity.com/v3"
HEADERS = {"Authorization": f"Bearer {api_key}"}

QUERY_TEMPLATES = {
    "air_side": '''
from(bucket: "devices_telemetry_15m")
|> range(start: time(v: "{start}"), stop: time(v: "{end}"))
|> filter(fn: (r) => r._measurement == "telemetry")
|> filter(fn: (r) => r.deviceId == "{device_id}")
|> filter(fn: (r) => r._field == "estAirflow" or r._field == "oadb-1" or r._field == "sadb-1" or
                       r._field == "oarh-1" or r._field == "sarh-1" or r._field == "radb-1" or
                       r._field == "rarh-1")
|> group(columns: ["deviceId"])
|> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
|> sort(columns:["_time"])
''',

    "liquid_line": '''
from(bucket: "devices_telemetry_15m")
|> range(start: time(v: "{start}"), stop: time(v: "{end}"))
|> filter(fn: (r) => r._measurement == "telemetry")
|> filter(fn: (r) => r.deviceId == "{device_id}")
|> filter(fn: (r) => r._field == "llpc-1" or r._field == "targetLiquidPressureHigh" or r._field == "targetLiquidPressureLow")
|> group(columns: ["deviceId"])
|> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
|> sort(columns:["_time"])
''',

    "suction_line": '''
from(bucket: "devices_telemetry_15m")
|> range(start: time(v: "{start}"), stop: time(v: "{end}"))
|> filter(fn: (r) => r._measurement == "telemetry")
|> filter(fn: (r) => r.deviceId == "{device_id}")
|> filter(fn: (r) => r._field == "sltc-1" or r._field == "spc-1" or r._field == "SLCSuperHeat-1" or
                       r._field == "targetSuctionPressureHigh" or r._field == "targetSuctionPressureLow")
|> group(columns: ["deviceId"])
|> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
|> sort(columns:["_time"])
'''
}


@retry_request(retries=3)
async def fetch_telemetry(client, device_id, query_type, start, end):
    query = QUERY_TEMPLATES[query_type].format(device_id=device_id, start=start, end=end)
    try:
        resp = await client.post(f"{BASE_URL}/telemetry/query", json={"query": query.strip()}, headers=HEADERS)
        resp.raise_for_status()
        return resp.json().get("data", [])
    except Exception as e:
        queue_error_message(f"Telemetry Fetch Error: {query_type}", str(e))
        return []

def serialize_to_parquet(records, output_path):
    if not records:
        return False
    try:
        df = pd.DataFrame(records)
        if df.empty:
            return False
        table = pa.Table.from_pandas(df)
        pq.write_table(table, output_path)
        return True
    except Exception as e:
        queue_error_message("Parquet Serialization Error", str(e))
        return False

def upload_to_snowflake_stage(cs, local_path, table_name):
    try:
        cs.execute(f"PUT file://{local_path} @%{table_name} OVERWRITE = TRUE")
        print(f"📤 Uploaded {local_path} to @%{table_name}")
    except Exception as e:
        queue_error_message("Snowflake PUT Error", str(e))

@retry_request(retries=3)
def fetch_equipment_with_devices():
    try:
        url = f"{BASE_URL}/equipment"
        params = {"include": "building,device", "limit": 100}
        results = []
        while url:
            resp = requests.get(url, headers=HEADERS, params=params)
            resp.raise_for_status()
            data = resp.json()
            results.extend(data.get("data", []))
            url = data.get("links", {}).get("next")
            params = {}
        return results
    except Exception as e:
        queue_error_message("Equipment Fetch Error", str(e))
        return []

def delete_old_data_from_snowflake(cs, start_iso, end_iso):
    try:
        for qt in ["air_side", "liquid_line", "suction_line"]:
            table = f"telemetry_{qt}"
            print(f"🧹 Deleting telemetry from {table} between {start_iso} and {end_iso}")
            cs.execute(f"""
                DELETE FROM {table}
                WHERE _time >= '{start_iso}' AND _time < '{end_iso}'
            """)
    except Exception as e:
        queue_error_message("Snowflake Delete Error", str(e))

async def fetch_and_upload_chunk(semaphore, client, cs, device_id, equipment_id, building_id, query_type, start, end):
    async with semaphore:
        timer_start = time.time()
        data = await fetch_telemetry(client, device_id, query_type, start, end)
        if not data:
            return

        for row in data:
            row["deviceId"] = device_id
            row["equipmentId"] = equipment_id
            row["buildingId"] = building_id
            row["queryType"] = query_type
            row["_ingested_at"] = datetime.utcnow().isoformat()

        table_name = f"telemetry_{query_type}"
        timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
        filename = f"{table_name}_{device_id}_{timestamp}.parquet"
        local_path = f"/tmp/{filename}"

        if serialize_to_parquet(data, local_path):
            upload_to_snowflake_stage(cs, local_path, table_name)
            cs.execute(f"""
                COPY INTO {table_name}
                FROM @%{table_name}
                FILE_FORMAT = (TYPE = PARQUET)
                MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE
                ON_ERROR = 'CONTINUE'
            """)
            os.remove(local_path)
        print(f"⏱️ Completed {query_type} {device_id} chunk in {time.time() - timer_start:.2f}s")

async def ingest_telemetry_for_device(client, semaphore, cs, device_id, equipment_id, building_id, start_iso, end_iso):
    query_types = ["air_side", "liquid_line", "suction_line"]
    start_dt = datetime.fromisoformat(start_iso.replace("Z", ""))
    end_dt = datetime.fromisoformat(end_iso.replace("Z", ""))
    delta = timedelta(days=5)
    time_ranges = []

    while start_dt < end_dt:
        chunk_end = min(start_dt + delta, end_dt)
        time_ranges.append((start_dt.isoformat() + "Z", chunk_end.isoformat() + "Z"))
        start_dt = chunk_end

    tasks = []
    for qt in query_types:
        for chunk_start, chunk_end in time_ranges:
            tasks.append(fetch_and_upload_chunk(
                semaphore, client, cs,
                device_id, equipment_id, building_id,
                qt, chunk_start, chunk_end
            ))
    await asyncio.gather(*tasks)

async def run_ingestion():
    equipment = fetch_equipment_with_devices()
    if not equipment:
        print("⚠️ No equipment found.")
        return

    refresh_window = os.getenv("REFRESH_WINDOW", "30d")
    if refresh_window == "full":
        start_iso = "2021-01-01T00:00:00Z"
    elif refresh_window.endswith("d") and refresh_window[:-1].isdigit():
        days = min(int(refresh_window[:-1]), 30)
        start_iso = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"
    else:
        start_iso = (datetime.utcnow() - timedelta(days=30)).isoformat() + "Z"

    end_iso = datetime.utcnow().isoformat() + "Z"

    conn = get_snowflake_connection(config)
    cs = conn.cursor()
    use_customer_database(cs, connector_name=connector_id)
    delete_old_data_from_snowflake(cs, start_iso, end_iso)

    print(f"📡 Ingesting telemetry from {start_iso} to {end_iso}")
    semaphore = asyncio.Semaphore(5)  # cap parallelism

    async with httpx.AsyncClient(timeout=60.0) as client:
        tasks = []
        for eq in equipment:
            device_id = eq.get("device", {}).get("deviceId")
            equipment_id = eq.get("id")
            building_id = eq.get("building", {}).get("id")
            if device_id:
                tasks.append(ingest_telemetry_for_device(
                    client, semaphore, cs,
                    device_id, equipment_id, building_id,
                    start_iso, end_iso
                ))
        await asyncio.gather(*tasks)

    cs.close()
    conn.close()
    send_batched_error_email()
    print("✅ Ingestion complete.")

if __name__ == "__main__":
    asyncio.run(run_ingestion())
