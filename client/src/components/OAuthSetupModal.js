import React, { useState } from "react";
import "./OAuthSetupModal.css";
import { useAuth } from "../context/AuthContext";

const OAuthSetupModal = ({ onClose, onSuccess, onCompleteRedirect }) => {
  const { user } = useAuth();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [redirectUri, setRedirectUri] = useState(
    "https://app.datakindred.com/oauth/callback"
  );
  const [scope, setScope] = useState("offline_access openid");

  // New required fields for config
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("SYSADMIN");
  const [warehouse, setWarehouse] = useState("COMPUTE_WH");

  const handleSubmit = async () => {
    if (
      !clientId ||
      !clientSecret ||
      !authUrl ||
      !tokenUrl ||
      !redirectUri ||
      !host ||
      !username ||
      !role ||
      !warehouse
    ) {
      alert("❌ All fields are required.");
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
      host,
      username,
      role,
      warehouse,
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
      onSuccess();
      onClose();
      if (onCompleteRedirect) onCompleteRedirect(accountId);
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

        {/* New Snowflake config fields */}
        <hr />
        <h3>Snowflake Connection</h3>

        <div className="form-group">
          <label>Snowflake Host</label>
          <input
            placeholder="abc-xy12345.snowflakecomputing.com"
            value={host}
            onChange={(e) => setHost(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Role</label>
          <input value={role} onChange={(e) => setRole(e.target.value)} />
        </div>

        <div className="form-group">
          <label>Warehouse</label>
          <input
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
          />
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
