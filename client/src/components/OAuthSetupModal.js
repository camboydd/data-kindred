import React, { useState } from "react";
import "./OAuthSetupModal.css";
import { useAuth } from "../context/AuthContext";

const OAuthSetupModal = ({ onClose, onSuccess, onCompleteRedirect }) => {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [scope, setScope] = useState("offline_access openid");

  const { user } = useAuth();

  const handleSubmit = async () => {
    if (!clientId || !clientSecret || !authUrl || !tokenUrl || !redirectUri) {
      alert("❌ All fields except scope are required.");
      return;
    }

    const token = localStorage.getItem("token");
    const accountId = user?.accountId;

    const payload = {
      accountId,
      clientId,
      clientSecret,
      authUrl,
      tokenUrl,
      redirectUri,
      scope,
    };

    const res = await fetch("/api/snowflake/oauth", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (res.ok) {
      onSuccess(); // Mark UI as configured
      onClose(); // Close modal
      if (onCompleteRedirect) onCompleteRedirect(accountId); // 🔁 Immediately redirect
    } else {
      alert(`❌ ${data.message}`);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Set Up OAuth Credentials</h2>

        <div className="form-group">
          <label>Client ID</label>
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Client Secret</label>
          <input
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Authorization URL</label>
          <input value={authUrl} onChange={(e) => setAuthUrl(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Token URL</label>
          <input
            value={tokenUrl}
            onChange={(e) => setTokenUrl(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Redirect URI</label>
          <input
            value={redirectUri}
            onChange={(e) => setRedirectUri(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Scope</label>
          <input value={scope} onChange={(e) => setScope(e.target.value)} />
        </div>

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
