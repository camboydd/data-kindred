import { connectToSnowflake, executeQuery } from "../util/snowflake-connection.js";
import { encrypt } from "./encryption.js"; // assumes you have this
import { saveAuthMethod } from "./saveAuthMethod.js";

export const saveSnowflakeOAuthTokens = async (accountId, { access_token, refresh_token, expires_in }) => {
  const encryptedAccess = encrypt(access_token);
  const encryptedRefresh = encrypt(refresh_token);

  const connection = await connectToSnowflake();

  const sql = `
  UPDATE KINDRED.PUBLIC.SNOWFLAKE_OAUTH_CONFIGS
  SET 
    OAUTH_ACCESS_TOKEN_ENCRYPTED = ?, 
    OAUTH_REFRESH_TOKEN_ENCRYPTED = ?, 
    TOKEN_EXPIRES_AT = DATEADD('second', ?, CURRENT_TIMESTAMP())
  WHERE ACCOUNT_ID = ?
`;

await saveAuthMethod(accountId, "oauth");

  const binds = [encryptedAccess, encryptedRefresh, expires_in, accountId];
  await executeQuery(connection, sql, binds);
};
