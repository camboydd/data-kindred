import { sendEmail } from "./send-email";

export const sendSetupPasswordEmail = async (email, token) => {
  const setupLink = `${process.env.FRONTEND_URL}/setup-password?token=${token}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Set Up Your Password</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style="
          font-family: 'Helvetica Neue', Arial, sans-serif;
          background-color: #f7f7f7;
          margin: 0;
          padding: 0;
        "
      >
        <table
          width="100%"
          cellpadding="0"
          cellspacing="0"
          style="max-width: 600px; margin: 40px auto; background: white; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.05);"
        >
          <tr>
            <td style="padding: 30px; text-align: center;">
              <img
                src="https://datakindred.com/kindred_purple48.png"
                alt="Kindred Logo"
                style="width: 120px; margin-bottom: 20px;"
              />
              <h1 style="color: #4f46e5; font-size: 24px;">Welcome to Kindred 👋</h1>
              <p style="color: #555; font-size: 16px;">
                You’re almost ready to start using Kindred. Just set your password to finish creating your account.
              </p>
              <a
                href="${setupLink}"
                style="
                  display: inline-block;
                  margin: 24px auto;
                  background-color: #4f46e5;
                  color: white;
                  padding: 14px 28px;
                  border-radius: 6px;
                  text-decoration: none;
                  font-weight: bold;
                  font-size: 16px;
                "
              >
                Set My Password
              </a>
              <p style="color: #999; font-size: 14px; margin-top: 30px;">
                Or paste this link into your browser:<br />
                <a href="${setupLink}" style="color: #4f46e5;">${setupLink}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
              <p style="font-size: 12px; color: #bbb;">
                This link will expire in 24 hours. If you didn’t request this, you can ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </body>
    </html>
    `;

  await sendEmail(email, "Set up your Kindred password", htmlContent);
};
