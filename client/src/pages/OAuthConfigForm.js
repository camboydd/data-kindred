import { useState } from "react";
import axios from "axios";

export default function OAuthConfigForm({ accountId }) {
  const [form, setForm] = useState({
    clientId: "",
    clientSecret: "",
    authUrl: "",
    tokenUrl: "",
    redirectUri: "https://app.datakindred.com/oauth/callback",
    scope: "offline_access openid",
    host: "",
    username: "",
    role: "",
    warehouse: "",
  });

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post("/api/snowflake/oauth", {
        ...form,
        accountId,
        connectorId: "snowflake",
      });
      alert("✅ Saved! Now you can connect via OAuth.");
    } catch (err) {
      console.error("Error saving OAuth config:", err);
      alert("Failed to save config.");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h3>🔐 OAuth Credentials</h3>
      <input name="clientId" placeholder="Client ID" onChange={handleChange} />
      <input
        name="clientSecret"
        placeholder="Client Secret"
        onChange={handleChange}
      />
      <input name="authUrl" placeholder="Auth URL" onChange={handleChange} />
      <input name="tokenUrl" placeholder="Token URL" onChange={handleChange} />
      <input
        name="redirectUri"
        placeholder="Redirect URI"
        value={form.redirectUri}
        readOnly
      />
      <input
        name="scope"
        placeholder="Scope"
        value={form.scope}
        onChange={handleChange}
      />

      <h3>❄️ Snowflake Account Info</h3>
      <input name="host" placeholder="Snowflake Host" onChange={handleChange} />
      <input
        name="username"
        placeholder="Snowflake Username"
        onChange={handleChange}
      />
      <input name="role" placeholder="Snowflake Role" onChange={handleChange} />
      <input
        name="warehouse"
        placeholder="Snowflake Warehouse"
        onChange={handleChange}
      />

      <button type="submit">Save Config</button>
    </form>
  );
}
