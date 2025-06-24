import snowflake from "snowflake-sdk";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();
snowflake.configure({ logLevel: "OFF" });

let connection = null;

const isConnectionAlive = () => {
  return connection && connection.isUp && connection.isUp();
};

const createNewConnection = () => {
  const privateKeyBase64 = process.env.SNOWFLAKE_PRIVATE_KEY_BASE64;
  if (!privateKeyBase64)
    throw new Error("Missing SNOWFLAKE_PRIVATE_KEY_BASE64");

  const privateKeyPem = Buffer.from(privateKeyBase64, "base64").toString(
    "utf8"
  );
  const privateKeyObject = crypto.createPrivateKey({
    key: privateKeyPem,
    format: "pem",
    type: "pkcs8",
  });

  const privateKey = privateKeyObject.export({
    format: "pem",
    type: "pkcs8",
  });

  return snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    authenticator: "SNOWFLAKE_JWT",
    privateKey,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    role: "SYSADMIN",
  });
};

const connectToSnowflake = () => {
  return new Promise((resolve, reject) => {
    if (isConnectionAlive()) {
      return resolve(connection);
    }

    connection = createNewConnection();

    connection.connect((err, conn) => {
      if (err) {
        console.error("❌ Snowflake connection failed:", err.message);
        connection = null;
        reject(err);
      } else {
        console.log("✅ Successfully connected to Snowflake.");
        resolve(conn);
      }
    });
  });
};

// Ensure connection is valid before executing any query
const executeQuery = async (conn, sqlText, binds = []) => {
  if (!conn || !conn.isUp || !conn.isUp()) {
    console.warn("⚠️ Reconnecting to Snowflake before executing query.");
    conn = await connectToSnowflake();
  }

  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, stmt, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      },
    });
  });
};

// Optional: keep-alive ping every 15 minutes
const keepAliveQuery = () => {
  if (!isConnectionAlive()) return;
  connection.execute({
    sqlText: "SELECT 1",
    complete: (err) => {
      if (err) {
        console.error("❌ Keep-alive query failed:", err.message);
      } else {
        console.log("✅ Snowflake keep-alive query successful.");
      }
    },
  });
};

setInterval(keepAliveQuery, 15 * 60 * 1000); // Every 15 minutes

export { connectToSnowflake, executeQuery };
