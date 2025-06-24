import { connectToSnowflake, executeQuery } from "../util/snowflake-connection.js";

export const getOAuthDetailsByAccountId = async (accountId) => {
  const connection = await connectToSnowflake();

  const sql = `
    SELECT CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, AUTH_URL, TOKEN_URL, SCOPE
    FROM KINDRED.PUBLIC.SNOWFLAKE_OAUTH_CONFIGS
    WHERE ACCOUNT_ID = ?
    LIMIT 1
  `;

  const rows = await executeQuery(connection, sql, [accountId]);

  if (!rows.length) return null;

  const config = rows[0];
  return {
    client_id: config.CLIENT_ID,
    client_secret: config.CLIENT_SECRET,
    redirect_uri: config.REDIRECT_URI,
    auth_url: config.AUTH_URL,
    token_url: config.TOKEN_URL,
    scope: config.SCOPE,
  };
};
