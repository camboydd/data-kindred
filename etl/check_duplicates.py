import os
import snowflake.connector
from dotenv import load_dotenv
import pandas as pd

load_dotenv()

# Connect to Snowflake
ctx = snowflake.connector.connect(
    user=os.getenv("SNOWFLAKE_USERNAME"),
    password='Dudesrule27',
    account=os.getenv("SNOWFLAKE_ACCOUNT"),
    warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
    role=os.getenv("SNOWFLAKE_ROLE")
)

# Configuration: schema is PUBLIC for both databases
DATABASES = {
    "SAGEINTACCT": {
        "schema": "PUBLIC",
        "key_map": {
            "GENERAL_LEDGER_DETAIL": ["RECORDNO"],
            "AP_VENDOR": ["RECORDNO"],
            "AR_INVOICE": ["RECORDNO"],
            "AP_BILL": ["RECORDNO"]
        }
    },
    "NCLARITY": {
        "schema": "PUBLIC",
        "key_map": {
            "TELEMETRY_AIR_SIDE": ["DEVICEID", "_TIME"],
            "TELEMETRY_LIQUID_LINE": ["DEVICEID", "_TIME"],
            "TELEMETRY_SUCTION_LINE": ["DEVICEID", "_TIME"],
            "EQUIPMENT": ["ID"],
            "DEVICE": ["ID"],
            "STATUS_RECORD": ["ID"],
            "SYSTEM_PROFILES": ["ID"]
        }
    }
}

def get_tables(database, schema):
    cur = ctx.cursor()
    cur.execute(f"""
        SELECT TABLE_NAME
        FROM {database}.INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = '{schema}' AND TABLE_TYPE = 'BASE TABLE'
    """)
    return [row[0] for row in cur.fetchall()]

def check_duplicates(database, schema, table, key_cols):
    print(f"\n🔍 {database}.{schema}.{table} on {key_cols}")
    cur = ctx.cursor()
    group_by = ", ".join(key_cols)
    query = f"""
        SELECT {group_by}, COUNT(*) AS COUNT
        FROM {database}.{schema}.{table}
        GROUP BY {group_by}
        HAVING COUNT(*) > 1
        LIMIT 100
    """
    try:
        cur.execute(query)
        rows = cur.fetchall()
        if rows:
            df = pd.DataFrame(rows, columns=key_cols + ["COUNT"])
            print(f"❗ Duplicates found:\n{df.to_string(index=False)}")
        else:
            print("✅ No duplicates found.")
    except Exception as e:
        print(f"⚠️ Skipped {table}: {e}")

def main():
    for db, config in DATABASES.items():
        schema = config["schema"]
        key_map = config["key_map"]
        print(f"\n=== Checking {db}.{schema} ===")
        ctx.cursor().execute(f"USE DATABASE {db}")
        ctx.cursor().execute(f"USE SCHEMA {schema}")
        tables = get_tables(db, schema)
        for table in tables:
            keys = key_map.get(table, ["RECORDNO"])
            check_duplicates(db, schema, table, keys)

    ctx.close()

if __name__ == "__main__":
    main()
