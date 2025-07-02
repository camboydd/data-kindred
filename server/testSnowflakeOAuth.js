import snowflake from "snowflake-sdk";
import dotenv from "dotenv";
dotenv.config();

const {
  SNOWFLAKE_ACCOUNT,
  SNOWFLAKE_USERNAME,
  SNOWFLAKE_ROLE,
  SNOWFLAKE_WAREHOUSE,
  SNOWFLAKE_OAUTH_TOKEN,
} = process.env;

if (
  !SNOWFLAKE_ACCOUNT ||
  !SNOWFLAKE_USERNAME ||
  !SNOWFLAKE_ROLE ||
  !SNOWFLAKE_WAREHOUSE ||
  !SNOWFLAKE_OAUTH_TOKEN
) {
  console.error("❌ Missing env vars");
  process.exit(1);
}

console.log("🔍 Starting Snowflake OAuth test...");

const connection = snowflake.createConnection({
  account: SNOWFLAKE_ACCOUNT,
  username: SNOWFLAKE_USERNAME,
  role: SNOWFLAKE_ROLE,
  warehouse: SNOWFLAKE_WAREHOUSE,
  authenticator: "oauth",
  token: SNOWFLAKE_OAUTH_TOKEN,
});

connection.connect((err, conn) => {
  if (err) {
    console.error("❌ Connection error:", err.message || err);
    process.exit(1);
  }

  console.log("✅ Connected to Snowflake.");

  connection.execute({
    sqlText: "SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_WAREHOUSE()",
    complete: (err, stmt, rows) => {
      if (err) {
        console.error("❌ Query failed:", err.message || err);
        connection.destroy(() => process.exit(1));
        return;
      }

      console.log("✅ Query successful:", rows);

      connection.destroy((closeErr) => {
        if (closeErr) {
          console.error("⚠️ Error during connection cleanup:", closeErr);
          process.exit(1);
        }

        console.log("👋 Connection closed. All good.");
        process.exit(0);
      });
    },
  });
});
