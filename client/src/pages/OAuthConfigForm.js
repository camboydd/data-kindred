// OAuthConfigForm.js
import { useState } from "react";
import axios from "axios";

export default function OAuthConfigForm({ accountId }) {
  const [form, setForm] = useState({
    clientId: "",
    clientSecret: "",
    authUrl: "",
    tokenUrl: "",
    redirectUri: "https://app.datakindred.com/api/snowflake/oauth/callback",
    scope: "offline_access openid",
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
      <button type="submit">Save Config</button>
    </form>
  );
}
