# modules/email_utils.py
import os
import smtplib
from email.message import EmailMessage

error_log = []

def queue_error_message(subject, body):
    error_log.append((subject, body))

def send_batched_error_email():
    if not error_log:
        print("✅ No errors encountered.")
        return

    try:
        msg = EmailMessage()
        msg['Subject'] = f"🛑 ETL Errors Summary ({len(error_log)} issues)"
        msg['From'] = os.getenv("EMAIL_USER")
        msg['To'] = os.getenv("ERROR_EMAIL_RECIPIENT", os.getenv("EMAIL_USER"))
        msg.set_content("\n\n".join(f"{s}\n{b}" for s, b in error_log))

        with smtplib.SMTP_SSL(os.getenv("EMAIL_HOST"), int(os.getenv("EMAIL_PORT"))) as smtp:
            smtp.login(os.getenv("EMAIL_USER"), os.getenv("EMAIL_PASS"))
            smtp.send_message(msg)

        print("📧 Batched error email sent.")
    except Exception as e:
        print(f"❌ Failed to send error email: {e}")
