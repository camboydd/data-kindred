import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import requests
import uuid
import pandas as pd
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import re
from shared_modules.retry_utils import retry_request, retry_db
from shared_modules.snowflake_utils import (
    fetch_config_from_snowflake,
    get_snowflake_connection,
    use_customer_database,
    ensure_database_exists,
    update_last_pull_timestamp,
    get_last_pull_timestamp,
    create_table_if_missing,
    evolve_schema_if_needed,
    log_etl_run
)
from shared_modules.crypto_utils import decrypt
from shared_modules.email_utils import queue_error_message, send_batched_error_email
from snowflake.connector.pandas_tools import write_pandas


# === Setup ===
load_dotenv()
SAGE_INTACCT_API_URL = "https://api.intacct.com/ia/xml/xmlgw.phtml"
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

manual_sync_id = os.getenv("MANUAL_SYNC_ID", None)

#account_id = "a8534efa-77b7-4f10-8aa8-54c63ac809d2"
account_id = sys.argv[1]
if not re.match(r'^[a-f0-9\-]{36}$', account_id.strip()):
    raise ValueError("Invalid account ID format.")

connector_id = "sageintacct"
run_session_id = str(uuid.uuid4())

config = fetch_config_from_snowflake(account_id, connector_id)
if "SOURCE_CREDENTIALS_VARIANT" in config:
    config["sourceCredentials"] = json.loads(config["SOURCE_CREDENTIALS_VARIANT"])

# ✅ Decrypt once at startup
DECRYPTED_SENDER_PW = decrypt(config["sourceCredentials"]["senderPassword"], ENCRYPTION_KEY).strip()
DECRYPTED_USER_PW = decrypt(config["sourceCredentials"]["userPassword"], ENCRYPTION_KEY).strip()

@retry_request()
def make_api_call(xml_payload):
    headers = {"Content-Type": "application/xml"}
    response = requests.post(SAGE_INTACCT_API_URL, data=xml_payload, headers=headers)
    if response.status_code == 200:
        return response.content
    else:
        raise Exception(f"API call failed: {response.status_code} - {response.text}")

def create_session_xml_payload(config):
    return f"""
    <request>
      <control>
        <senderid>{config["sourceCredentials"]["senderId"]}</senderid>
        <password>{DECRYPTED_SENDER_PW}</password>
        <controlid>{datetime.now().strftime('%Y%m%d%H%M%S')}</controlid>
        <uniqueid>false</uniqueid>
        <dtdversion>3.0</dtdversion>
        <includewhitespace>false</includewhitespace>
      </control>
      <operation>
        <authentication>
          <login>
            <userid>{config["sourceCredentials"]["userId"]}</userid>
            <companyid>{config["sourceCredentials"]["companyId"]}</companyid>
            <password>{DECRYPTED_USER_PW}</password>
          </login>
        </authentication>
        <content>
          <function controlid="{str(uuid.uuid4())}">
            <getAPISession/>
          </function>
        </content>
      </operation>
    </request>
    """

def parse_session_key(response_content):
    root = ET.fromstring(response_content)
    session_key = root.find('.//sessionid')
    if session_key is not None:
        print("✅ Session key obtained.")
        return session_key.text
    raise ValueError("Session key not found")

def create_query_xml_payload(session_key, object_name, fields="*", custom_query="", result_id=None, pagesize=1000):
    root = ET.Element("request")
    control = ET.SubElement(root, "control")
    ET.SubElement(control, "senderid").text = config["sourceCredentials"]["senderId"]
    ET.SubElement(control, "password").text = DECRYPTED_SENDER_PW
    ET.SubElement(control, "controlid").text = datetime.now().strftime("%Y%m%d%H%M%S")
    ET.SubElement(control, "uniqueid").text = "false"
    ET.SubElement(control, "dtdversion").text = "3.0"
    ET.SubElement(control, "includewhitespace").text = "false"

    operation = ET.SubElement(root, "operation")
    authentication = ET.SubElement(operation, "authentication")
    session_element = ET.Element("sessionid")
    session_element.text = session_key
    authentication.append(session_element)

    content = ET.SubElement(operation, "content")
    function = ET.SubElement(content, "function", controlid=str(uuid.uuid4()))

    if result_id:
        readMore = ET.SubElement(function, "readMore")
        ET.SubElement(readMore, "resultId").text = result_id
    else:
        readByQuery = ET.SubElement(function, "readByQuery")
        ET.SubElement(readByQuery, "object").text = object_name
        ET.SubElement(readByQuery, "fields").text = fields
        ET.SubElement(readByQuery, "query").text = custom_query
        ET.SubElement(readByQuery, "pagesize").text = str(pagesize)

    return ET.tostring(root, encoding="unicode")

def parse_response(response_content, object_tag):
    root = ET.fromstring(response_content)
    data_list = []
    elements = root.findall(f'.//{object_tag}')
    for elem in elements:
        data = {child.tag: child.text for child in elem}
        data_list.append(data)
    result_id = root.find('.//data').get('resultId') if root.find('.//data') is not None else None
    print(f"📄 Parsed {len(data_list)} records. Result ID: {result_id}")
    return data_list, result_id

@retry_db()
def import_to_snowflake(conn, table_name, data):
    print(f"\n📥 Starting import for table: {table_name}")

    if not data:
        print(f"⚠️  No data to import for table {table_name}")
        return

    df = pd.DataFrame(data)
    if df.empty:
        print(f"⚠️  Empty DataFrame for table {table_name}")
        return

    df.columns = [re.sub(r'\W+', '_', c).upper() for c in df.columns]
    cur = conn.cursor()

    create_table_if_missing(cur, table_name, df)
    evolve_schema_if_needed(cur, table_name, df)

    # 1. Create a temporary stage table
    temp_table = f"{table_name}_STAGE_{uuid.uuid4().hex[:6].upper()}"
    col_defs = ', '.join([f"{col} VARCHAR" for col in df.columns])
    cur.execute(f"CREATE OR REPLACE TEMP TABLE {temp_table} ({col_defs})")
    print(f"✅ Temp stage table created: {temp_table}")

    # 2. Insert into temp table using executemany
    placeholders = ', '.join(['%s'] * len(df.columns))
    insert_sql = f"INSERT INTO {temp_table} ({', '.join(df.columns)}) VALUES ({placeholders})"
    rows = [tuple(row) for row in df.fillna('').values.tolist()]

    print(f"📝 Inserting {len(rows)} rows using executemany...")
    BATCH_SIZE = 10000

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i:i+BATCH_SIZE]
        cur.executemany(insert_sql, batch)
        print(f"✅ Inserted batch {i // BATCH_SIZE + 1}: {len(batch)} rows")

    print(f"✅ Inserted {len(rows)} rows into {temp_table}")

    # 3. Merge into final table
    merge_cols = [col for col in df.columns if col != "RECORDNO"]
    update_clause = ', '.join([f"T.{col} = S.{col}" for col in merge_cols])
    insert_clause = ', '.join(df.columns)
    insert_values = ', '.join([f"S.{col}" for col in df.columns])

    merge_sql = f"""
    MERGE INTO {table_name} T
    USING {temp_table} S
    ON T.RECORDNO = S.RECORDNO
    WHEN MATCHED THEN UPDATE SET {update_clause}
    WHEN NOT MATCHED THEN INSERT ({insert_clause}) VALUES ({insert_values})
    """

    try:
        cur.execute(merge_sql)
        print(f"✅ Merge completed for {table_name}")
    except Exception as e:
        print(f"❌ Error during merge for table {table_name}: {e}")
        raise

def get_quarterly_date_ranges(last_pull_str):
    if isinstance(last_pull_str, datetime):
        start_date = last_pull_str.astimezone(timezone.utc).replace(tzinfo=None)
    elif isinstance(last_pull_str, str):
        start_date = datetime.strptime(last_pull_str, '%Y-%m-%dT%H:%M:%SZ')
    else:
        start_date = datetime(2023, 1, 1)

    # Use UTC and remove tzinfo to make both datetime objects naive and comparable
    end_date = datetime.utcnow()

    ranges = []
    while start_date < end_date:
        quarter_end = (start_date + pd.offsets.QuarterEnd()).to_pydatetime()
        if quarter_end > end_date:
            quarter_end = end_date
        ranges.append((start_date.strftime('%m-%d-%Y %H:%M:%S'), quarter_end.strftime('%m-%d-%Y %H:%M:%S')))
        start_date = quarter_end
    return ranges

@retry_db()
def process_object_for_range(session_key, obj, start, end):
    conn = None
    try:
        conn = get_snowflake_connection(config)
        use_customer_database(conn.cursor(), connector_id)
        query = f"WHENMODIFIED >= '{start}' AND WHENMODIFIED < '{end}'"
        print(f"🧩 Processing {obj['snowflake_table']} for range {start} → {end}")
        result_id = None
        batch_count = 0
        use_customer_database(conn.cursor(), connector_id)

        BATCH_BUFFER = []
        BATCH_SIZE = 10000

        while True:
            xml = create_query_xml_payload(session_key, obj["object_name"], custom_query=query, result_id=result_id)
            response = make_api_call(xml)
            parsed, result_id = parse_response(response, obj["object_tag"])

            if parsed:
                BATCH_BUFFER.extend(parsed)

            # if we hit buffer limit or no more data
            if len(BATCH_BUFFER) >= BATCH_SIZE or not result_id or len(parsed) < 1000:
                if BATCH_BUFFER:
                    import_to_snowflake(conn, obj["snowflake_table"], BATCH_BUFFER)
                    batch_count += len(BATCH_BUFFER)
                    BATCH_BUFFER = []

            if not result_id or len(parsed) < 1000:
                break


        if batch_count > 0:
            update_last_pull_timestamp(
                config=config,
                account_id=account_id,
                connector_id=connector_id,
                table_name=obj["snowflake_table"],
                new_timestamp=datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            )
            log_etl_run(config, account_id, connector_id, obj["snowflake_table"], batch_count, "success", run_session_id,
    manual_sync_id=manual_sync_id)
    except Exception as e:
        queue_error_message(f"{obj['object_name']} error", str(e))
        log_etl_run(config, account_id, connector_id, obj["snowflake_table"], 0, "error", run_session_id, error_message=str(e),
    manual_sync_id=manual_sync_id)

OBJECTS_TAGS_TABLES = [
{"object_name": "USERINFO", "object_tag": "userinfo", "snowflake_table": "USER", "query": ""},
{"object_name": "USERGROUP", "object_tag": "usergroup", "snowflake_table": "USER_GROUP", "query": ""},
{"object_name": "CLASS", "object_tag": "class", "snowflake_table": "CLASS", "query": ""},
{"object_name": "CONTACT", "object_tag": "contact", "snowflake_table": "CONTACT", "query": ""},
{"object_name": "DEPARTMENTGROUP", "object_tag": "departmentgroup", "snowflake_table": "DEPARTMENT_GROUP", "query": ""},
{"object_name": "LOCATION", "object_tag": "location", "snowflake_table": "LOCATION", "query": ""},
{"object_name": "DEPARTMENT", "object_tag": "department", "snowflake_table": "DEPARTMENT", "query": ""},
{"object_name": "GLACCTGRP", "object_tag": "glacctgrp", "snowflake_table": "GENERAL_LEDGER_ACCOUNT_GROUP", "query": ""},
{"object_name": "GLACCOUNT", "object_tag": "glaccount", "snowflake_table": "GENERAL_LEDGER_ACCOUNT", "query": ""},
{"object_name": "REPORTINGPERIOD", "object_tag": "reportingperiod", "snowflake_table": "GENERAL_LEDGER_REPORTING_PERIOD", "query": ""},
{"object_name": "STATACCOUNT", "object_tag": "stataccount", "snowflake_table": "GENERAL_LEDGER_STAT_ACCOUNT", "query": ""},
{"object_name": "GLBATCH", "object_tag": "glbatch", "snowflake_table": "GENERAL_LEDGER_JOURNAL_ENTRY", "query": "JOURNAL = 'GJ'"},
{"object_name": "BANKFEE", "object_tag": "bankfee", "snowflake_table": "BANK_INTEREST_INCOME_CHARGES", "query": ""},
{"object_name": "BANKFEEENTRY", "object_tag": "bankfeeentry", "snowflake_table": "BANK_INTEREST_INCOME_CHARGES_LINES", "query": ""},
{"object_name": "CHECKINGACCOUNT", "object_tag": "checkingaccount", "snowflake_table": "CHECKING_ACCOUNT", "query": ""},
###{"object_name": "BANKACCTRECON", "object_tag": "bankacctrecon", "snowflake_table": "CHECKING_ACCOUNT_RECONCILIATIONS", "query": ""},
{"object_name": "FUNDSTRANSFER", "object_tag": "fundstransfer", "snowflake_table": "FUNDS_TRANSFER", "query": ""},
{"object_name": "FUNDSTRANSFERENTRY", "object_tag": "fundstransferentry", "snowflake_table": "FUNDS_TRANSFER_ENTRY", "query": ""},
{"object_name": "OTHERRECEIPTS", "object_tag": "otherreceipts", "snowflake_table": "OTHER_RECEIPTS", "query": ""},
{"object_name": "OTHERRECEIPTSENTRY", "object_tag": "otherreceiptsentry", "snowflake_table": "OTHER_RECEIPTS_ENTRY", "query": ""},
{"object_name": "APPYMT", "object_tag": "appymt", "snowflake_table": "AP_PAYMENT", "query": ""},
###{"object_name": "APBILLBATCH", "object_tag": "apbillbatch", "snowflake_table": "AP_BILL_BATCH", "query": ""},
{"object_name": "APTERM", "object_tag": "apterm", "snowflake_table": "AP_TERM", "query": ""},
{"object_name": "APBILLITEM", "object_tag": "apbillitem", "snowflake_table": "AP_BILL_ITEM", "query": ""},
{"object_name": "APRECURBILL", "object_tag": "aprecurbill", "snowflake_table": "AP_RECUR_BILL", "query": ""},
{"object_name": "VENDOR", "object_tag": "vendor", "snowflake_table": "AP_VENDOR", "query": ""},
{"object_name": "ARADJUSTMENT", "object_tag": "aradjustment", "snowflake_table": "AR_ADJUSTMENT", "query": ""},
{"object_name": "ARADVANCE", "object_tag": "aradvance", "snowflake_table": "AR_ADVANCE", "query": ""},
{"object_name": "ARPYMT", "object_tag": "arpymt", "snowflake_table": "AR_PAYMENT", "query": ""},
###{"object_name": "ARINVOICEBATCH", "object_tag": "arinvoicebatch", "snowflake_table": "AR_INVOICE_BATCH", "query": ""},
{"object_name": "ARINVOICE", "object_tag": "arinvoice", "snowflake_table": "AR_INVOICE", "query": ""},
{"object_name": "ARTERM", "object_tag": "arterm", "snowflake_table": "AR_TERM", "query": ""},
{"object_name": "EMPLOYEE", "object_tag": "employee", "snowflake_table": "EMPLOYEE", "query": ""},
{"object_name": "PODOCUMENTPARAMS", "object_tag": "podocumentparams", "snowflake_table": "PO_DOCUMENT_PARAMS", "query": ""},
{"object_name": "PODOCUMENTENTRY", "object_tag": "podocumententry", "snowflake_table": "PO_DOCUMENT_ENTRY", "query": ""},
{"object_name": "PODOCUMENTSUBTOTALS", "object_tag": "podocumentsubtotals", "snowflake_table": "PO_DOCUMENT_SUBTOTAL", "query": ""},
{"object_name": "SODOCUMENT", "object_tag": "sodocument", "snowflake_table": "SO_DOCUMENT", "query": ""},
{"object_name": "SODOCUMENTENTRY", "object_tag": "sodocumententry", "snowflake_table": "SO_DOCUMENT_ENTRY", "query": ""},
{"object_name": "SODOCUMENTSUBTOTALS", "object_tag": "sodocumentsubtotals", "snowflake_table": "SO_DOCUMENT_SUBTOTAL", "query": ""},
{"object_name": "APBILL", "object_tag": "apbill", "snowflake_table": "AP_BILL", "query": ""},
{"object_name": "GLBUDGETITEM", "object_tag": "glbudgetitem", "snowflake_table": "BUDGETITEMS", "query": ""},
{"object_name": "GLDETAIL", "object_tag": "gldetail", "snowflake_table": "GENERAL_LEDGER_DETAIL", "query": ""},
]

if __name__ == "__main__":
    try:
        session_key = parse_session_key(make_api_call(create_session_xml_payload(config)))
        conn = get_snowflake_connection(config)
        ensure_database_exists(conn, connector_id)
        use_customer_database(conn.cursor(), connector_id)
        MAX_WORKERS = min(16, os.cpu_count() * 2)
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = []
            for obj in OBJECTS_TAGS_TABLES:
                last_pull = get_last_pull_timestamp(config, account_id, connector_id, obj["snowflake_table"])
                date_ranges = get_quarterly_date_ranges(last_pull)

                for start, end in date_ranges:
                    futures.append(executor.submit(
    process_object_for_range,
    session_key,
    obj,
    start,
    end
))

            for future in as_completed(futures):
                future.result()

        conn.close()
    except Exception as e:
        queue_error_message("ETL Script Error", str(e))
    finally:
        send_batched_error_email()