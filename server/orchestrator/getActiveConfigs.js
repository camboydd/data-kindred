// getActiveConfigs.js
import snowflake from 'snowflake-sdk';

export async function getActiveConnectorConfigs() {
  const conn = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT,
    username: process.env.SNOWFLAKE_USERNAME,
    password: process.env.SNOWFLAKE_PASSWORD,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    role: process.env.SNOWFLAKE_ROLE,
  });

  return new Promise((resolve, reject) => {
    conn.connect((err) => {
      if (err) return reject(err);
      const sql = `
        SELECT ACCOUNT_ID, CONNECTOR_ID
        FROM KINDRED.PUBLIC.CONNECTOR_CONFIGS
        WHERE STATUS = 'active'
      `;

      conn.execute({
        sqlText: sql,
        complete: (err, stmt, rows) => {
          if (err) return reject(err);
          resolve(rows); // [{ ACCOUNT_ID: '...', CONNECTOR_ID: 'nclarity' }, ...]
        }
      });
    });
  });
}
