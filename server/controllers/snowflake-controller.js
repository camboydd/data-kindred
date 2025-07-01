import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";
import HttpError from "../models/http-error.js";
import { v4 as uuidv4 } from "uuid";
import { encrypt, decrypt } from "../util/encryption.js";
import { Buffer } from "buffer";
import crypto from "crypto";
import snowflake from "snowflake-sdk";
import axios from "axios";
import querystring from "querystring";
import { saveSnowflakeOAuthTokens } from "../util/saveSnowflakeOAuthTokens.js";
import { getOAuthDetailsByAccountId } from "../util/getOAuthDetailsByAccountId.js";
import { saveAuthMethod } from "../util/saveAuthMethod.js";
import { logAuditEvent } from "../util/auditLogger.js";

function ensurePEMFormat(base64Key) {
  const raw = base64Key.replace(/[\r\n]/g, "").trim();
  const lines = raw.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join(
    "\n"
  )}\n-----END PRIVATE KEY-----`;
}

const getSnowflakeConfigs = async (req, res, next) => {
  const accountId = req.user?.accountId;
  if (!accountId) {
    return next(new HttpError("Unauthorized: missing account ID", 401));
  }

  try {
    const connection = await connectToSnowflake();
    const rows = await executeQuery(
      connection,
      `SELECT ID, ACCOUNT_ID, USERNAME, ROLE, WAREHOUSE, AUTH_METHOD, CREATED_AT
       FROM KINDRED.PUBLIC.SNOWFLAKE_CONFIGS
       WHERE ACCOUNT_ID = ?`,
      [accountId]
    );

    const configs = rows.map((row) => ({
      id: row.ID,
      account: row.ACCOUNT_ID,
      username: row.USERNAME,
      role: row.ROLE,
      warehouse: row.WAREHOUSE,
      auth_method: row.AUTH_METHOD,
      created_at: row.CREATED_AT,
    }));

    res.status(200).json(configs);
  } catch (err) {
    console.error("❌ Error fetching Snowflake configs:", err);
    return next(new HttpError("Failed to fetch Snowflake configs.", 500));
  }
};

const createSnowflakeConfig = async (req, res, next) => {
  const {
    account,
    host,
    username,
    password,
    privateKey,
    passphrase,
    oauthToken,
    oauthRefreshToken,
    role,
    warehouse,
    authMethod,
  } = req.body;

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!account || !host || !username || !role || !warehouse || !authMethod) {
    return next(
      new HttpError("Missing required Snowflake config fields.", 400)
    );
  }

  try {
    const connection = await connectToSnowflake();
    const id = uuidv4();

    let decodedPrivateKey = privateKey;
    if (privateKey && !privateKey.includes("-----BEGIN")) {
      try {
        decodedPrivateKey = ensurePEMFormat(
          Buffer.from(privateKey, "base64").toString("utf8")
        );
        console.log("🔐 Successfully base64-decoded the private key.");
      } catch (err) {
        console.warn(
          "⚠️ Could not decode privateKey from base64. Using raw input."
        );
      }
    }

    const encryptedPassword = password ? encrypt(password) : null;
    const encryptedPrivateKey = decodedPrivateKey
      ? encrypt(decodedPrivateKey)
      : null;
    const encryptedPassphrase = passphrase ? encrypt(passphrase) : null;
    const encryptedOauthToken = oauthToken ? encrypt(oauthToken) : null;
    const encryptedOauthRefreshToken = oauthRefreshToken
      ? encrypt(oauthRefreshToken)
      : null;

    await executeQuery(
      connection,
      `MERGE INTO KINDRED.PUBLIC.SNOWFLAKE_CONFIGS AS target
  USING (
    SELECT
      ? AS ACCOUNT_ID,
      ? AS HOST,
      ? AS USERNAME,
      ? AS ROLE,
      ? AS WAREHOUSE,
      ? AS AUTH_METHOD,
      ? AS PASSWORD_ENCRYPTED,
      ? AS PRIVATE_KEY_ENCRYPTED,
      ? AS PASSPHRASE_ENCRYPTED,
      ? AS OAUTH_ACCESS_TOKEN_ENCRYPTED,
      ? AS OAUTH_REFRESH_TOKEN_ENCRYPTED,
      CURRENT_TIMESTAMP() AS UPDATED_AT
  ) AS source
  ON target.ACCOUNT_ID = source.ACCOUNT_ID

  WHEN MATCHED THEN
    UPDATE SET
      HOST = source.HOST,
      USERNAME = source.USERNAME,
      ROLE = source.ROLE,
      WAREHOUSE = source.WAREHOUSE,
      AUTH_METHOD = source.AUTH_METHOD,
      PASSWORD_ENCRYPTED = source.PASSWORD_ENCRYPTED,
      PRIVATE_KEY_ENCRYPTED = source.PRIVATE_KEY_ENCRYPTED,
      PASSPHRASE_ENCRYPTED = source.PASSPHRASE_ENCRYPTED,
      OAUTH_ACCESS_TOKEN_ENCRYPTED = source.OAUTH_ACCESS_TOKEN_ENCRYPTED,
      OAUTH_REFRESH_TOKEN_ENCRYPTED = source.OAUTH_REFRESH_TOKEN_ENCRYPTED,
      UPDATED_AT = source.UPDATED_AT

  WHEN NOT MATCHED THEN
    INSERT (
      ID,
      ACCOUNT_ID,
      HOST,
      USERNAME,
      ROLE,
      WAREHOUSE,
      AUTH_METHOD,
      PASSWORD_ENCRYPTED,
      PRIVATE_KEY_ENCRYPTED,
      PASSPHRASE_ENCRYPTED,
      OAUTH_ACCESS_TOKEN_ENCRYPTED,
      OAUTH_REFRESH_TOKEN_ENCRYPTED,
      CREATED_AT,
      UPDATED_AT
    )
    VALUES (
      ?, -- ID (UUID)
      source.ACCOUNT_ID,
      source.HOST,
      source.USERNAME,
      source.ROLE,
      source.WAREHOUSE,
      source.AUTH_METHOD,
      source.PASSWORD_ENCRYPTED,
      source.PRIVATE_KEY_ENCRYPTED,
      source.PASSPHRASE_ENCRYPTED,
      source.OAUTH_ACCESS_TOKEN_ENCRYPTED,
      source.OAUTH_REFRESH_TOKEN_ENCRYPTED,
      CURRENT_TIMESTAMP(),
      source.UPDATED_AT
    );`,
      [
        account,
        host,
        username,
        role,
        warehouse,
        authMethod,
        encryptedPassword,
        encryptedPrivateKey,
        encryptedPassphrase,
        encryptedOauthToken,
        encryptedOauthRefreshToken,
        id,
      ]
    );

    await saveAuthMethod(account, authMethod);

    await logAuditEvent({
      accountId: account, // target
      initiatorEmail: req.user?.email,
      initiatorAccountId: req.user?.accountId,
      actor: req.user?.email || "unknown",
      action: "create_snowflake_config",
      target: account,
      status: "success",
      metadata: {
        authMethod,
        username,
        role,
        warehouse,
        ip,
      },
    });

    res.status(201).json({ message: "✅ Snowflake config created.", id });
  } catch (err) {
    console.error("❌ Error creating Snowflake config:", err);
    return next(new HttpError("Failed to create Snowflake config.", 500));
  }
};

const testSnowflakeConnection = async (req, res, next) => {
  const {
    account,
    username,
    password,
    privateKey,
    oauthToken,
    role,
    warehouse,
    database,
    schema,
    authMethod,
  } = req.body;

  console.log("🧪 Starting testSnowflakeConnection...");

  if (!account || !username || !authMethod) {
    return next(
      new HttpError("Missing credentials to test Snowflake connection.", 400)
    );
  }

  try {
    const connectionConfig = {
      account,
      username,
      role,
      warehouse,
      database,
      schema,
      clientSessionKeepAlive: true,
    };

    if (authMethod === "password") {
      if (!password) {
        return next(new HttpError("Missing password for password auth.", 400));
      }
      connectionConfig.password = password;
    } else if (authMethod === "keypair") {
      if (!privateKey) {
        return next(
          new HttpError("Missing private key for key pair authentication.", 400)
        );
      }

      try {
        const privateKeyObject = crypto.createPrivateKey({
          key: privateKey,
          format: "pem",
          type: "pkcs8",
        });

        connectionConfig.privateKey = privateKeyObject.export({
          format: "pem",
          type: "pkcs8",
        });

        connectionConfig.authenticator = "SNOWFLAKE_JWT";
      } catch (keyErr) {
        return next(new HttpError("Invalid private key format.", 400));
      }
    } else if (authMethod === "oauth") {
      if (!oauthToken) {
        return next(new HttpError("Missing OAuth token.", 400));
      }
      connectionConfig.authenticator = "oauth";
      connectionConfig.token = oauthToken;
    } else {
      return next(new HttpError("Unsupported auth method.", 400));
    }

    const testConnection = snowflake.createConnection(connectionConfig);

    // Add timeout to prevent indefinite hangs
    const connectWithTimeout = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Check Snowflake Account"));
      }, 10000);

      testConnection.connect((err, conn) => {
        clearTimeout(timeout);
        if (err) return reject(err);
        console.log("✅ Connected to Snowflake");
        resolve(conn);
      });
    });

    await connectWithTimeout;

    await new Promise((resolve, reject) => {
      testConnection.execute({
        sqlText: "SELECT CURRENT_USER(), CURRENT_ROLE(), CURRENT_WAREHOUSE()",
        complete: (err, stmt, rows) => {
          if (err) return reject(err);
          console.log("✅ Test query result:", rows);
          resolve();
        },
      });
    });

    res.status(200).json({ success: true, message: "Connection successful." });
  } catch (err) {
    console.error("❌ Snowflake connection test failed:", err.message || err);
    return next(
      new HttpError(`Failed to connect to Snowflake: ${err.message}`, 400)
    );
  }
};

// DELETE /api/snowflake/configs/:id
const deleteSnowflakeConfig = async (req, res, next) => {
  const configId = req.params.id;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!configId) {
    return next(new HttpError("Missing Snowflake config ID.", 400));
  }

  try {
    const connection = await connectToSnowflake();

    await executeQuery(
      connection,
      `DELETE FROM KINDRED.PUBLIC.SNOWFLAKE_CONFIGS WHERE ID = ?`,
      [configId]
    );

    await logAuditEvent({
      accountId: req.body?.accountId || req.user?.accountId, // ideally pass accountId from frontend too
      initiatorEmail: req.user?.email,
      initiatorAccountId: req.user?.accountId,
      actor: req.user?.email || "unknown",
      action: "delete_snowflake_config",
      target: configId,
      status: "success",
      metadata: { ip },
    });

    res.status(200).json({ message: "Snowflake config deleted." });
  } catch (err) {
    console.error("❌ Error deleting Snowflake config:", err);
    return next(new HttpError("Failed to delete Snowflake config.", 500));
  }
};

const getSnowflakeConfigStatus = async (req, res, next) => {
  const accountId = req.body.accountId;

  if (!accountId) {
    return next(new HttpError("Missing account ID.", 400));
  }

  try {
    const connection = await connectToSnowflake();

    const rows = await executeQuery(
      connection,
      `
      SELECT HOST, USERNAME, AUTH_METHOD, PASSWORD_ENCRYPTED, PRIVATE_KEY_ENCRYPTED,
             PASSPHRASE_ENCRYPTED, OAUTH_ACCESS_TOKEN_ENCRYPTED, ROLE, WAREHOUSE
      FROM KINDRED.PUBLIC.SNOWFLAKE_CONFIGS
      WHERE ACCOUNT_ID = ?
      LIMIT 1
      `,
      [accountId]
    );

    if (!rows.length) {
      return res.status(200).json({ isConfigured: false });
    }

    const config = rows[0];

    const password = config.PASSWORD_ENCRYPTED
      ? decrypt(config.PASSWORD_ENCRYPTED)
      : undefined;
    const privateKey = config.PRIVATE_KEY_ENCRYPTED
      ? decrypt(config.PRIVATE_KEY_ENCRYPTED)
      : undefined;
    const passphrase = config.PASSPHRASE_ENCRYPTED
      ? decrypt(config.PASSPHRASE_ENCRYPTED)
      : undefined;
    const oauthToken = config.OAUTH_ACCESS_TOKEN_ENCRYPTED
      ? decrypt(config.OAUTH_ACCESS_TOKEN_ENCRYPTED)
      : undefined;

    const testConnection = snowflake.createConnection({
      account: config.HOST,
      username: config.USERNAME,
      role: config.ROLE,
      warehouse: config.WAREHOUSE,
      authenticator:
        config.AUTH_METHOD === "oauth"
          ? "oauth"
          : config.AUTH_METHOD === "keypair"
          ? "SNOWFLAKE_JWT"
          : undefined,
      password: config.AUTH_METHOD === "password" ? password : undefined,
      privateKey: config.AUTH_METHOD === "keypair" ? privateKey : undefined,
      passphrase: config.AUTH_METHOD === "keypair" ? passphrase : undefined,
      token: config.AUTH_METHOD === "oauth" ? oauthToken : undefined,
    });

    await new Promise((resolve, reject) => {
      testConnection.connect((err, conn) => {
        if (err) return reject(err);
        resolve(conn);
      });
    });

    res.status(200).json({ isConfigured: true });
  } catch (err) {
    console.error("❌ Snowflake config validation failed:", err.message || err);
    res.status(200).json({ isConfigured: false });
  }
};

const authorizeSnowflakeOAuth = async (req, res, next) => {
  try {
    const { accountId } = req.query;
    if (!accountId) return next(new HttpError("Missing accountId", 400));

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const details = await getOAuthDetailsByAccountId(accountId);
    if (!details)
      return next(new HttpError("OAuth config not found for account", 404));

    const {
      client_id,
      redirect_uri,
      auth_url,
      scope = "offline_access openid",
    } = details;

    const params = querystring.stringify({
      client_id,
      response_type: "code",
      redirect_uri,
      scope,
      response_mode: "query",
      state: accountId,
    });

    await logAuditEvent({
      accountId,
      initiatorEmail: req.user?.email || "anonymous",
      initiatorAccountId: req.user?.accountId || "unknown",
      actor: req.user?.email || "anonymous",
      action: "start_oauth_flow",
      target: accountId,
      status: "success",
      metadata: {
        client_id,
        redirect_uri,
        ip,
      },
    });

    return res.redirect(`${auth_url}?${params}`);
  } catch (err) {
    console.error("❌ OAuth authorization error:", err);
    return next(new HttpError("Failed to initiate OAuth flow.", 500));
  }
};

const handleOAuthCallback = async (req, res, next) => {
  try {
    const { code, accountId } = req.body;
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    if (!code || !accountId) {
      return next(new HttpError("Missing OAuth code or accountId", 400));
    }

    const details = await getOAuthDetailsByAccountId(accountId);
    if (!details) {
      return next(new HttpError("OAuth config not found", 404));
    }

    const { token_url, client_id, client_secret, redirect_uri } = details;

    const tokenRes = await axios.post(
      token_url,
      querystring.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri,
        client_id,
        client_secret,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    await saveSnowflakeOAuthTokens(accountId, {
      access_token,
      refresh_token,
      expires_in,
    });

    await logAuditEvent({
      accountId,
      initiatorEmail: req.user?.email || "anonymous",
      initiatorAccountId: req.user?.accountId || "unknown",
      actor: req.user?.email || "anonymous",
      action: "handle_oauth_callback",
      target: accountId,
      status: "success",
      metadata: {
        expires_in,
        ip,
      },
    });

    return res.json({
      message: "✅ OAuth connection successful. You can now close this window.",
    });
  } catch (err) {
    console.error(
      "❌ OAuth callback error:",
      err.response?.data || err.message || err
    );
    return next(new HttpError("OAuth callback failed", 500));
  }
};

const saveOAuthConfig = async (req, res, next) => {
  try {
    const {
      accountId,
      clientId,
      clientSecret,
      authUrl,
      tokenUrl,
      redirectUri,
      scope,
    } = req.body;

    if (
      !accountId ||
      !clientId ||
      !clientSecret ||
      !authUrl ||
      !tokenUrl ||
      !redirectUri
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const connection = await connectToSnowflake();

    await executeQuery(
      connection,
      `
      MERGE INTO KINDRED.PUBLIC.SNOWFLAKE_OAUTH_CONFIGS target
      USING (SELECT ? AS ACCOUNT_ID) source
      ON target.ACCOUNT_ID = source.ACCOUNT_ID
      WHEN MATCHED THEN UPDATE SET 
        CLIENT_ID = ?, 
        CLIENT_SECRET = ?, 
        AUTH_URL = ?, 
        TOKEN_URL = ?, 
        REDIRECT_URI = ?, 
        SCOPE = ?, 
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN INSERT (
        ACCOUNT_ID, CLIENT_ID, CLIENT_SECRET, AUTH_URL, TOKEN_URL, REDIRECT_URI, SCOPE, CREATED_AT
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP())
      `,
      [
        accountId,
        clientId,
        clientSecret,
        authUrl,
        tokenUrl,
        redirectUri,
        scope || "offline_access openid",
        accountId,
        clientId,
        clientSecret,
        authUrl,
        tokenUrl,
        redirectUri,
        scope || "offline_access openid",
      ]
    );

    await logAuditEvent({
      accountId,
      initiatorEmail: req.user?.email || "anonymous",
      initiatorAccountId: req.user?.accountId || "unknown",
      actor: req.user?.email || "anonymous",
      action: "save_oauth_config",
      target: accountId,
      status: "success",
      metadata: {
        clientId,
        redirectUri,
        ip,
      },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Failed to save OAuth config:", err);
    next(err);
  }
};

const getAuthMethod = async (req, res) => {
  const { accountId } = req.body;
  console.log("✅ getAuthMethod hit with accountId:", req.body.accountId);
  const connection = await connectToSnowflake();

  const result = await executeQuery(
    connection,
    `
    SELECT CURRENT_AUTH_METHOD FROM KINDRED.PUBLIC.SNOWFLAKE_AUTH_METHOD
    WHERE ACCOUNT_ID = ?`,
    [accountId]
  );

  if (result.length) {
    res.json({ method: result[0].CURRENT_AUTH_METHOD });
  } else {
    res.status(404).json({ message: "No method found" });
  }
};

// POST /api/snowflake/configs/delete
const deleteSnowflakeConfigsByAccount = async (req, res, next) => {
  const { accountId } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!accountId) {
    return next(new HttpError("Missing account ID.", 400));
  }

  try {
    const connection = await connectToSnowflake();

    await executeQuery(
      connection,
      `DELETE FROM KINDRED.PUBLIC.SNOWFLAKE_CONFIGS WHERE ACCOUNT_ID = ?`,
      [accountId]
    );

    await logAuditEvent({
      accountId,
      initiatorEmail: req.user?.email,
      initiatorAccountId: req.user?.accountId,
      actor: req.user?.email || "unknown",
      action: "delete_snowflake_configs_by_account",
      target: accountId,
      status: "success",
      metadata: { ip },
    });

    res.status(200).json({ message: "Snowflake configs deleted for account." });
  } catch (err) {
    console.error("❌ Error deleting Snowflake configs by account:", err);
    return next(new HttpError("Failed to delete Snowflake configs.", 500));
  }
};

export {
  testSnowflakeConnection,
  createSnowflakeConfig,
  getSnowflakeConfigs,
  deleteSnowflakeConfig,
  getSnowflakeConfigStatus,
  authorizeSnowflakeOAuth,
  handleOAuthCallback,
  saveOAuthConfig,
  getAuthMethod,
  deleteSnowflakeConfigsByAccount,
};
