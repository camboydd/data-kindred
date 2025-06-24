// models/user-model.js
import { connectToSnowflake } from "../util/snowflake-connection.js";

export const getUserByEmail = async (email) => {
  try {
    const connection = await connectToSnowflake();

    const sql = `
      SELECT * FROM KINDRED.PUBLIC.USERS WHERE LOWER(EMAIL) = LOWER(?) LIMIT 1;

    `;

    return new Promise((resolve, reject) => {
      connection.execute({
        sqlText: sql,
        binds: [email],
        complete: (err, stmt, rows) => {
          if (err) {
            console.error("❌ Error executing query:", err.message);
            return reject(err);
          }

          if (!rows || rows.length === 0) {
            return resolve(null);
          }

          const row = rows[0];
          resolve({
            id: row.ID,
            email: row.EMAIL,
            name: row.NAME,
            passwordHash: row.PASSWORD_HASH,
            role: row.ROLE,
            account_id: row.ACCOUNT_ID,
          });
        },
      });
    });
  } catch (error) {
    console.error("❌ Error in getUserByEmail:", error);
    throw error;
  }
};
