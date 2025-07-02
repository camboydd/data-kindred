import React, { useState } from "react";
import "./OAuthSetupModal.css";
import { useAuth } from "../context/AuthContext";

const OAuthSetupModal = ({ onClose, onSuccess, onCompleteRedirect }) => {
  const { user } = useAuth();
  const accountId = user?.accountId;

  const [form, setForm] = useState({
    clientId: "e2d1a371-4e6d-4e26-a0a4-5abcc470b200",
    clientSecret: "vfK8Q~WlOV8AtJalX6SmToEEvMGFmnaopM1Q6b5l",
    authUrl:
      "https://login.microsoftonline.com/f1b746f3-5f8e-4b58-adb3-395deab7bf9a/oauth2/v2.0/authorize",
    tokenUrl:
      "https://login.microsoftonline.com/f1b746f3-5f8e-4b58-adb3-395deab7bf9a/oauth2/v2.0/token",
    redirectUri: "https://app.datakindred.com/oauth/callback",
    scope: "offline_access openid",
    host: "tlb87607.us-east-1",
    username: "data_engineer_user",
    role: "programmatic_role",
    warehouse: "COMPUTE_WH",
  });

  const handleChange = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async () => {
    const missing = Object.entries(form)
      .filter(([_, v]) => !v)
      .map(([k]) => k);

    if (missing.length) {
      alert(`❌ Missing: ${missing.join(", ")}`);
      return;
    }

    const payload = { ...form }; // No accountId sent

    try {
      const res = await fetch("/api/snowflake/oauth", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        onSuccess?.();
        onClose?.();
        onCompleteRedirect?.(accountId);
      } else {
        alert(`❌ ${data.message || "OAuth setup failed"}`);
      }
    } catch (err) {
      alert("❌ Request failed: " + err.message);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Set Up OAuth Credentials</h2>

        {[
          ["Client ID", "clientId"],
          ["Client Secret", "clientSecret"],
          ["Authorization URL", "authUrl"],
          ["Token URL", "tokenUrl"],
          ["Redirect URI", "redirectUri"],
          ["Scope", "scope"],
        ].map(([label, key]) => (
          <div key={key} className="form-group">
            <label>{label}</label>
            <input value={form[key]} onChange={handleChange(key)} />
          </div>
        ))}

        <hr />
        <h3>Snowflake Connection</h3>

        {[
          ["Snowflake Host", "host"],
          ["Username", "username"],
          ["Role", "role"],
          ["Warehouse", "warehouse"],
        ].map(([label, key]) => (
          <div key={key} className="form-group">
            <label>{label}</label>
            <input value={form[key]} onChange={handleChange(key)} />
          </div>
        ))}

        <div className="modal-actions">
          <button className="setup-button" onClick={handleSubmit}>
            Save
          </button>
          <button className="setup-button cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default OAuthSetupModal;
