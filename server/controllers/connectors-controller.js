import {
  connectToSnowflake,
  executeQuery,
} from "../util/snowflake-connection.js";
import HttpError from "../models/http-error.js";
import { v4 as uuidv4 } from "uuid";
import { encrypt, decrypt } from "../util/encryption.js";
import fetch from "node-fetch";
import {
  buildSessionRequestXML,
  parseSessionResponseXML,
} from "../util/sage-intacct-util.js"; // You’ll create this helper
import { logAuditEvent } from "../util/auditLogger.js";
import { runEtlForCustomer } from "../orchestrator/runEtlForCustomer.js";

const CONNECTOR_API_MAP = {
  nclarity: {
    url: "https://api.nclarity.com/v3/customers",
    authHeader: (apiKey) => `Bearer ${apiKey}`,
    credentialKey: "apiKey",
    sensitiveFields: ["apiKey"], // ← Add this
  },
  sageintacct: {
    url: "https://api.intacct.com/ia/xml/xmlgw.phtml",
    testConnection: async (credentials) => {
      const { userId, userPassword, senderId, senderPassword, companyId } =
        credentials;

      const sessionXml = `
        <request>
          <control>
            <senderid>${senderId}</senderid>
            <password>${senderPassword}</password>
            <controlid>test-${Date.now()}</controlid>
            <uniqueid>false</uniqueid>
            <dtdversion>3.0</dtdversion>
            <includewhitespace>false</includewhitespace>
          </control>
          <operation>
            <authentication>
              <login>
                <userid>${userId}</userid>
                <companyid>${companyId}</companyid>
                <password>${userPassword}</password>
              </login>
            </authentication>
            <content>
              <function controlid="testFunc">
                <getAPISession />
              </function>
            </content>
          </operation>
        </request>
      `;

      const res = await fetch("https://api.intacct.com/ia/xml/xmlgw.phtml", {
        method: "POST",
        headers: {
          "Content-Type": "application/xml",
        },
        body: sessionXml,
      });

      const xmlText = await res.text();
      if (!res.ok || !xmlText.includes("<status>success</status>")) {
        throw new Error("Invalid Sage Intacct credentials or session error.");
      }

      return true;
    },
    sensitiveFields: ["userPassword", "senderPassword"],
  },
};

export const getConnectorStatus = async (req, res, next) => {
  const connectorId = req.params.id;
  const accountId = req.body.accountId || req.query.accountId;

  if (!accountId) {
    return next(new HttpError("Missing account ID", 400));
  }

  try {
    const connection = await connectToSnowflake();
    const results = await executeQuery(
      connection,
      `SELECT SOURCE_CREDENTIALS_VARIANT FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS
       WHERE ACCOUNT_ID = ? AND CONNECTOR_ID = ?`,
      [accountId, connectorId]
    );

    if (results.length === 0) {
      return res.status(200).json({ [connectorId]: "not_configured" });
    }

    const creds = results[0].SOURCE_CREDENTIALS_VARIANT;

    const connectorConfig = CONNECTOR_API_MAP[connectorId];
    if (!connectorConfig) {
      console.warn(`⚠️ No connector config found for '${connectorId}'`);
      return res.status(200).json({ [connectorId]: "unknown_connector" });
    }

    if (connectorId === "sageintacct") {
      const { companyId, userId, senderId, userPassword, senderPassword } =
        creds;

      if (
        !companyId ||
        !userId ||
        !senderId ||
        !userPassword ||
        !senderPassword
      ) {
        return res.status(200).json({ [connectorId]: "invalid_credentials" });
      }

      let decryptedUserPassword, decryptedSenderPassword;
      try {
        decryptedUserPassword = decrypt(userPassword)?.trim();
        decryptedSenderPassword = decrypt(senderPassword)?.trim();
      } catch (err) {
        console.error("❌ Failed to decrypt Sage credentials:", err);
        return res.status(500).json({ [connectorId]: "decryption_failed" });
      }

      try {
        const xml = buildSessionRequestXML({
          companyId,
          userId,
          senderId,
          userPassword: decryptedUserPassword,
          senderPassword: decryptedSenderPassword,
        });

        const response = await fetch(
          "https://api.intacct.com/ia/xml/xmlgw.phtml",
          {
            method: "POST",
            headers: { "Content-Type": "application/xml" },
            body: xml,
          }
        );

        const body = await response.text();
        const sessionKey = parseSessionResponseXML(body);
        if (!sessionKey) {
          console.warn("⚠️ Sage XML:", body); // add this
        }

        if (sessionKey) {
          return res.status(200).json({ [connectorId]: "connected" });
        } else {
          console.warn("⚠️ Invalid Sage response:", body.slice(0, 300));
          return res.status(200).json({ [connectorId]: "not_connected" });
        }
      } catch (err) {
        console.error("❌ Sage Intacct status check failed:", err);
        return res.status(500).json({ [connectorId]: "fetch_failed" });
      }
    }
    let apiKey;
    if (
      connectorConfig.credentialKey &&
      creds?.[connectorConfig.credentialKey]
    ) {
      try {
        apiKey = decrypt(creds[connectorConfig.credentialKey])?.trim();
      } catch (err) {
        console.error("❌ Failed to decrypt API key:", err);
        return res.status(500).json({ [connectorId]: "decryption_failed" });
      }
    }

    if (!apiKey) {
      return res.status(200).json({ [connectorId]: "invalid_credentials" });
    }

    try {
      const response = await fetch(connectorConfig.url, {
        headers: {
          Authorization: connectorConfig.authHeader(apiKey),
          Accept: "application/json",
        },
      });

      if (response.ok) {
        return res.status(200).json({ [connectorId]: "connected" });
      } else {
        const errorText = await response.text();
        console.error(
          `${connectorId} responded with ${response.status}: ${errorText}`
        );
        return res.status(200).json({ [connectorId]: "not_connected" });
      }
    } catch (err) {
      console.error("❌ Fetch failed while checking status:", err);
      return res.status(500).json({ [connectorId]: "fetch_failed" });
    }
  } catch (err) {
    console.error("❌ Error checking connector status:", err);
    return next(new HttpError("Failed to check connector status", 500));
  }
};

export const getConnectorConfig = async (req, res, next) => {
  const accountId = req.body.accountId || req.query.accountId;
  const connectorId = req.params.id;

  try {
    const connection = await connectToSnowflake();
    const result = await executeQuery(
      connection,
      `SELECT SOURCE_CREDENTIALS_VARIANT FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS
       WHERE ACCOUNT_ID = ? AND CONNECTOR_ID = ?`,
      [accountId, connectorId]
    );

    if (result.length === 0) {
      return res.status(200).json({ sourceCredentials: {} }); // no config yet
    }

    const config = result[0].SOURCE_CREDENTIALS_VARIANT;
    res.status(200).json({ sourceCredentials: config });
  } catch (err) {
    console.error("❌ Error fetching connector config:", err);
    return next(new HttpError("Could not fetch connector config.", 500));
  }
};

export const createOrUpdateConnectorConfig = async (req, res, next) => {
  console.log("🔔 Reached createOrUpdateConnectorConfig()");
  const { connectorId, sourceCredentials, accountId } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!connectorId || !sourceCredentials || !accountId) {
    console.error("❌ Missing connectorId or accountId or credentials:", {
      connectorId,
      accountId,
      sourceCredentials,
    });
    return next(
      new HttpError("Missing connectorId, accountId, or credentials", 400)
    );
  }

  const connector = CONNECTOR_API_MAP[connectorId];
  let encryptedCredentials = { ...sourceCredentials };

  if (connector?.sensitiveFields?.length > 0) {
    for (const field of connector.sensitiveFields) {
      if (encryptedCredentials[field]) {
        try {
          encryptedCredentials[field] = encrypt(encryptedCredentials[field]);
          console.log(`🔐 Encrypted ${field} before saving.`);
        } catch (err) {
          console.error(`❌ Failed to encrypt ${field}:`, err);
          return next(new HttpError(`Failed to encrypt ${field}`, 500));
        }
      }
    }
  }

  const credentialKeys = Object.keys(encryptedCredentials);
  const configId = uuidv4();

  console.log("📦 Preparing to save connector config:", {
    id: configId,
    accountId,
    connectorId,
    encryptedCredentials,
  });

  try {
    const connection = await connectToSnowflake();

    const existing = await executeQuery(
      connection,
      `SELECT ID FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS
       WHERE ACCOUNT_ID = ? AND CONNECTOR_ID = ?`,
      [accountId, connectorId]
    );

    console.log("🔎 existing config check returned:", existing);

    let action = "created_connector_config";

    if (existing.length > 0) {
      console.log("✏️ Running UPDATE for existing config");
      await executeQuery(
        connection,
        `
        UPDATE KINDRED.PUBLIC.CONNECTOR_CONFIGS
        SET 
          SOURCE_CREDENTIALS_VARIANT = PARSE_JSON(?),
          UPDATED_AT = CURRENT_TIMESTAMP()
        WHERE ID = ?
        `,
        [JSON.stringify(encryptedCredentials), existing[0].ID]
      );

      action = "updated_connector_config";
    } else {
      console.log("📥 Running INSERT for new config");
      await executeQuery(
        connection,
        `
          INSERT INTO KINDRED.PUBLIC.CONNECTOR_CONFIGS (ID, ACCOUNT_ID, CONNECTOR_ID, SOURCE_CREDENTIALS_VARIANT)
          SELECT ?, ?, ?, PARSE_JSON(?)
        `,
        [configId, accountId, connectorId, JSON.stringify(encryptedCredentials)]
      );
    }

    await logAuditEvent({
      accountId,
      actorEmail: req.user?.email || "system",
      initiatorEmail: req.user?.email,
      initiatorAccountId: req.user?.accountId,
      action,
      targetEntity: `${accountId}:${connectorId}`,
      status: "success",
    });

    console.log("✅ DB update or insert succeeded");
    res.status(200).json({ success: true, message: "Connector config saved." });
  } catch (err) {
    console.error("❌ Error saving connector config:", err);

    await logAuditEvent({
      accountId,
      actorEmail: req.user?.email || "system",
      initiatorEmail: req.user?.email,
      initiatorAccountId: req.user?.accountId,
      action: "save_connector_config",
      targetEntity: `${accountId}:${connectorId}`,
      status: "fail",
    });

    return next(new HttpError("Failed to save connector config.", 500));
  }
};

export const testConnectorConnection = async (req, res, next) => {
  const { sourceCredentials } = req.body;
  const connectorId = req.params.id;

  if (!sourceCredentials || Object.keys(sourceCredentials).length === 0) {
    return res.status(400).json({
      success: false,
      message: "Missing credentials",
    });
  }

  // ✅ Add Sage-specific connection logic
  if (connectorId === "sageintacct") {
    const { companyId, userId, senderId, userPassword, senderPassword } =
      sourceCredentials;

    const missingFields = [];
    if (!companyId?.trim()) missingFields.push("companyId");
    if (!userId?.trim()) missingFields.push("userId");
    if (!senderId?.trim()) missingFields.push("senderId");
    if (!userPassword?.trim()) missingFields.push("userPassword");
    if (!senderPassword?.trim()) missingFields.push("senderPassword");

    console.log("🧪 Received Sage credentials:", {
      companyId,
      userId,
      senderId,
      userPassword,
      senderPassword,
    });

    if (missingFields.length > 0) {
      console.warn("❌ Missing Sage credentials:", missingFields);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    try {
      const xml = buildSessionRequestXML({
        companyId,
        userId,
        senderId,
        userPassword,
        senderPassword,
      });

      console.log("📨 Built Sage login XML:", xml);

      const response = await fetch(
        "https://api.intacct.com/ia/xml/xmlgw.phtml",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/xml",
          },
          body: xml,
        }
      );

      const body = await response.text();
      console.log("🧾 Sage raw XML response:", body);

      const sessionKey = parseSessionResponseXML(body);

      if (sessionKey) {
        console.log("✅ Sage connection test succeeded with sessionKey.");
        return res.status(200).json({ success: true });
      } else {
        console.warn("⚠️ Sage connection failed: no session key extracted.");
        return res.status(400).json({
          success: false,
          message: "Invalid Sage credentials.",
        });
      }
    } catch (err) {
      console.error("❌ Sage Intacct connection test failed:", err);
      return res.status(500).json({
        success: false,
        message: "Sage test failed.",
      });
    }
  }

  // 🧠 Fall back to normal logic for other connectors
  const connectorConfig = CONNECTOR_API_MAP[connectorId];
  if (!connectorConfig) {
    return res.status(400).json({
      success: false,
      message: "Unknown connector type.",
    });
  }

  const rawKey = sourceCredentials[connectorConfig.credentialKey];
  if (!rawKey) {
    return res.status(400).json({
      success: false,
      message: `Missing ${connectorConfig.credentialKey}`,
    });
  }

  try {
    const response = await fetch(connectorConfig.url, {
      headers: {
        Authorization: connectorConfig.authHeader(rawKey),
        Accept: "application/json",
      },
    });

    if (response.ok) {
      return res.status(200).json({ success: true });
    } else {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        message: `${connectorId} responded with status ${response.status}: ${errorText}`,
      });
    }
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `Connection test failed: ${err.message}`,
    });
  }
};

export const getAllConnectorStatuses = async (req, res, next) => {
  const accountId = req.query.accountId;

  if (!accountId) {
    return next(new HttpError("Missing account ID", 400));
  }

  try {
    const connection = await connectToSnowflake();

    // Get all connector configs for this account
    const results = await executeQuery(
      connection,
      `SELECT CONNECTOR_ID, SOURCE_CREDENTIALS_VARIANT
       FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS
       WHERE ACCOUNT_ID = ?`,
      [accountId]
    );

    // Group results by connectorId
    const credsByConnector = {};
    results.forEach(({ CONNECTOR_ID, SOURCE_CREDENTIALS_VARIANT }) => {
      credsByConnector[CONNECTOR_ID] = SOURCE_CREDENTIALS_VARIANT;
    });

    // Evaluate all known connectors in parallel
    const connectorIds = Object.keys(CONNECTOR_API_MAP);

    const statusChecks = connectorIds.map(async (id) => {
      const config = CONNECTOR_API_MAP[id];
      const rawCreds = credsByConnector[id];

      if (!rawCreds) {
        console.log(
          `🔌 ${id}: No credentials found — marking as not_configured`
        );
        return { id, status: "not_configured" };
      }

      let credentials = { ...rawCreds };
      console.log(`🔍 Raw creds for ${id}:`, rawCreds);
      console.log(`🔍 Expecting credentialKey: ${config.credentialKey}`);
      console.log(
        `🔍 Value to decrypt:`,
        rawCreds[config.credentialKey],
        typeof rawCreds[config.credentialKey]
      );

      try {
        // Decrypt sensitive fields (supports either array of fields or a single key)
        if (config?.sensitiveFields?.length > 0) {
          for (const field of config.sensitiveFields) {
            const rawEncrypted = credentials[field];
            if (!rawEncrypted || typeof rawEncrypted !== "string") {
              console.warn(
                `⚠️ ${id}: Missing or invalid sensitive field '${field}'`
              );
              return { id, status: "invalid_credentials" };
            }
            try {
              credentials[field] = decrypt(rawEncrypted);
            } catch (err) {
              console.error(`❌ ${id}: Decryption failed for '${field}':`, err);
              return { id, status: "decryption_failed" };
            }
          }
        } else if (config?.credentialKey && credentials[config.credentialKey]) {
          const rawValue = credentials[config.credentialKey];
          if (!rawValue || typeof rawValue !== "string") {
            console.warn(
              `⚠️ ${id}: Missing or invalid credential key '${config.credentialKey}'`
            );
            return { id, status: "invalid_credentials" };
          }

          try {
            credentials[config.credentialKey] = decrypt(rawValue);
          } catch (err) {
            console.error(
              `❌ ${id}: Failed to decrypt '${config.credentialKey}':`,
              err
            );
            return { id, status: "decryption_failed" };
          }
        }
      } catch (err) {
        console.error(`❌ ${id}: Failed to decrypt credentials:`, err);
        return { id, status: "decryption_failed" };
      }

      // Run connection test
      try {
        if (config.testConnection) {
          await config.testConnection(credentials);
          return { id, status: "connected" };
        } else {
          const response = await fetch(config.url, {
            headers: {
              Authorization: config.authHeader(
                credentials[config.credentialKey]
              ),
              Accept: "application/json",
            },
          });

          if (response.ok) {
            return { id, status: "connected" };
          } else {
            const errText = await response.text();
            console.warn(`⚠️ ${id}: Status ${response.status}: ${errText}`);
            return { id, status: "not_connected" };
          }
        }
      } catch (err) {
        console.error(`❌ ${id}: Status check failed:`, err);
        return { id, status: "fetch_failed" };
      }
    });

    const resultsArray = await Promise.all(statusChecks);

    // Build final map
    const statusMap = {};
    resultsArray.forEach(({ id, status }) => {
      statusMap[id] = status;
    });

    console.log("✅ Returning connector statuses:", statusMap);
    return res.status(200).json(statusMap);
  } catch (err) {
    console.error("❌ Failed to retrieve batch statuses:", err);
    return next(new HttpError("Error retrieving connector statuses", 500));
  }
};

export const getAllConnectorConfigs = async (req, res, next) => {
  const accountId = req.query.accountId;

  if (!accountId) {
    return res.status(400).json({ message: "Missing accountId" });
  }

  try {
    const connection = await connectToSnowflake();
    const result = await executeQuery(
      connection,
      `SELECT CONNECTOR_ID, SOURCE_CREDENTIALS_VARIANT
       FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS
       WHERE ACCOUNT_ID = ?`,
      [accountId]
    );

    const configs = result.map((row) => ({
      connectorId: row.CONNECTOR_ID,
      credentials: row.SOURCE_CREDENTIALS_VARIANT,
    }));

    res.status(200).json({ configs });
  } catch (err) {
    console.error("❌ Error fetching connector configs:", err);
    return next(new HttpError("Could not fetch connector configs.", 500));
  }
};
export const deleteConnectorConfig = async (req, res, next) => {
  const { accountId } = req.body;
  const connectorId = req.params.id;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!accountId || !connectorId) {
    return next(new HttpError("Missing accountId or connectorId.", 400));
  }

  try {
    const connection = await connectToSnowflake();

    // Check if config exists
    const existing = await connection.execute({
      sqlText: `SELECT ID FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS WHERE ACCOUNT_ID = ? AND CONNECTOR_ID = ?`,
      binds: [accountId, connectorId],
    });

    if (existing.length === 0) {
      return res.status(404).json({ message: "Connector config not found." });
    }

    // Delete the config
    await connection.execute({
      sqlText: `DELETE FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS WHERE ACCOUNT_ID = ? AND CONNECTOR_ID = ?`,
      binds: [accountId, connectorId],
    });

    // Audit
    await logAuditEvent({
      accountId,
      actorEmail: req.user?.email || "unknown",
      initiatorEmail: req.user?.email,
      initiatorAccountId: req.user?.accountId,
      action: "delete_connector_config",
      targetEntity: `${accountId}:${connectorId}`,
      status: "success",
      metadata: { ip },
    });

    res.status(200).json({ message: "Connector configuration deleted." });
  } catch (err) {
    console.error("❌ Error deleting connector config:", err);
    return next(new HttpError("Failed to delete connector config.", 500));
  }
};

export const getManualSyncLogs = async (req, res, next) => {
  const { connectorId, accountId } = req.query;
  if (!connectorId || !accountId) {
    return next(new HttpError("Missing connectorId or accountId", 400));
  }

  try {
    const connection = await connectToSnowflake();
    const result = await executeQuery(
      connection,
      `
      SELECT * FROM KINDRED.PUBLIC.MANUAL_SYNC_LOGS 
      WHERE ACCOUNT_ID = ? AND CONNECTOR_ID = ?
      ORDER BY CREATED_AT DESC 
      LIMIT 10
      `,
      [accountId, connectorId]
    );

    const logs = result.map((log) => ({
      id: log.ID,
      accountId: log.ACCOUNT_ID,
      connectorId: log.CONNECTOR_ID,
      refreshWindow: log.REFRESH_WINDOW,
      status: log.STATUS,
      createdAt: log.CREATED_AT?.toISOString?.() ?? null,
      startedAt: log.STARTED_AT?.toISOString?.() ?? null,
      completedAt: log.COMPLETED_AT?.toISOString?.() ?? null,
      errorMessage: log.ERROR_MESSAGE ?? null,
      durationSeconds: log.DURATION_SECONDS ?? null,
      tableName: log.TABLE_NAME ?? null,
      rowCount: log.ROW_COUNT ?? null,
    }));

    const latest = logs[0];
    const inProgress =
      latest?.status === "in_progress" ||
      (!latest?.completedAt && !!latest?.startedAt);

    res.status(200).json({ logs, inProgress });
  } catch (err) {
    console.error("❌ Failed to fetch manual sync logs:", err);
    return next(new HttpError("Error retrieving sync logs", 500));
  }
};

export const triggerManualSync = async (req, res, next) => {
  const { connectorId, refreshWindow, accountId } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  if (!connectorId || !refreshWindow || !accountId) {
    return next(
      new HttpError("Missing connectorId, refreshWindow or accountId", 400)
    );
  }

  const connection = await connectToSnowflake();
  const manualSyncId = crypto.randomUUID();
  const startTime = Date.now();
  const nowUtc = new Date();

  try {
    // 1. Log sync start
    await executeQuery(
      connection,
      `
        INSERT INTO KINDRED.PUBLIC.MANUAL_SYNC_LOGS 
          (ID, ACCOUNT_ID, CONNECTOR_ID, REFRESH_WINDOW, STATUS, CREATED_AT, STARTED_AT)
        VALUES (?, ?, ?, ?, 'queued', ?, ?)
      `,
      [manualSyncId, accountId, connectorId, refreshWindow, nowUtc, nowUtc]
    );

    // 2. Run ETL
    console.log("🚀 Starting ETL for", {
      connectorId,
      accountId,
      refreshWindow,
      manualSyncId,
    });

    const { syncedAt, rowCount, errorMessage } = await runEtlForCustomer(
      connectorId,
      accountId,
      {
        manualSyncId,
        refreshWindow,
      }
    );

    const status = errorMessage ? "partial_success" : "success";
    const durationSeconds = (Date.now() - startTime) / 1000;
    const completedAtUtc = new Date();

    // 3. Update log
    await executeQuery(
      connection,
      `
        UPDATE KINDRED.PUBLIC.MANUAL_SYNC_LOGS
        SET 
          STATUS = ?,
          COMPLETED_AT = ?,
          ROW_COUNT = ?, 
          DURATION_SECONDS = ?,
          ERROR_MESSAGE = ?
        WHERE ID = ?
      `,
      [
        status,
        completedAtUtc,
        rowCount,
        durationSeconds,
        errorMessage,
        manualSyncId,
      ]
    );

    // 4. Respond to client
    res.status(200).json({
      message: "Manual sync complete",
      syncId: manualSyncId,
      rowCount,
      syncedAt: completedAtUtc.toISOString(),
      errorMessage,
    });
  } catch (err) {
    console.error("❌ Manual sync failed:", err);
    const errorTimeUtc = new Date();

    await executeQuery(
      connection,
      `
        UPDATE KINDRED.PUBLIC.MANUAL_SYNC_LOGS
        SET 
          STATUS = 'error',
          COMPLETED_AT = ?,
          ERROR_MESSAGE = ?
        WHERE ID = ?
      `,
      [errorTimeUtc, err.message, manualSyncId]
    );

    return next(new HttpError("Manual sync failed", 500));
  } finally {
    connection?.destroy();
  }
};
