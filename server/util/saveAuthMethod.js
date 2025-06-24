import { connectToSnowflake, executeQuery } from "./snowflake-connection.js";

export const saveAuthMethod = async (accountId, method) => {
  const connection = await connectToSnowflake();

  await executeQuery(
    connection,
    `
    MERGE INTO KINDRED.PUBLIC.SNOWFLAKE_AUTH_METHOD target
    USING (SELECT ? AS ACCOUNT_ID) source
    ON target.ACCOUNT_ID = source.ACCOUNT_ID
    WHEN MATCHED THEN UPDATE SET 
      CURRENT_AUTH_METHOD = ?, 
      UPDATED_AT = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
      ACCOUNT_ID, CURRENT_AUTH_METHOD, UPDATED_AT
    ) VALUES (?, ?, CURRENT_TIMESTAMP())
    `,
    [accountId, method, accountId, method]
  );
};
