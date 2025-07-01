import React, { useState, useEffect } from "react";
import { Database, Trash2, Loader2 } from "lucide-react";
import Navbar from "../components/Navbar";
import OAuthSetupModal from "../components/OAuthSetupModal";
import { useAuth } from "../context/AuthContext";
import "./SnowflakeConfigPage.css";
import { authFetch } from "../util/authFetch";

const SnowflakeConfigPage = () => {
  const { user, authLoading } = useAuth();
  const [snowflakeConfig, setSnowflakeConfig] = useState({
    account: "",
    host: "",
    username: "",
    password: "",
    privateKey: "",
    passphrase: "",
    oauthToken: "",
    oauthRefreshToken: "",
    role: "",
    warehouse: "",
    authMethod: "password",
  });

  const [message, setMessage] = useState("");
  const [connectionStatus, setConnectionStatus] = useState(null); // null | "success" | "error"
  const [isTested, setIsTested] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [isOAuthConfigured, setIsOAuthConfigured] = useState(false);
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [activeMethod, setActiveMethod] = useState("");
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [hasTestedSinceLastSave, setHasTestedSinceLastSave] = useState(false);

  const [testLoading, setTestLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!user || authLoading) return;
    const fetchAuthMethod = async () => {
      // SnowflakeConfigPage fetch → update to remove Authorization
      const res = await authFetch("/api/snowflake/configs/auth-method", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }, // REMOVE Authorization header
        body: JSON.stringify({ accountId: user.accountId }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveMethod(data.method || "unknown");
      }
    };

    fetchAuthMethod();
  }, [user, authLoading]);

  useEffect(() => {
    if (!user || authLoading) return;

    const checkStatus = async () => {
      setStatusLoading(true);
      try {
        const res = await authFetch("/api/snowflake/configs/status", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: user.accountId }),
        });

        const data = await res.json();
        if (res.ok && data.isConfigured) {
          setIsConfigured(true);
          setConnectionStatus("success");
        }
      } catch (err) {
        console.error("Error fetching Snowflake config status:", err);
      } finally {
        setStatusLoading(false);
      }
    };

    checkStatus();
  }, [user, authLoading]);

  const handleChange = (e) => {
    const { id, value } = e.target;
    setSnowflakeConfig((prev) => ({ ...prev, [id]: value }));
  };

  const handleSaveConfig = async () => {
    setSaveLoading(true);
    const error = validateConfig();
    if (error) {
      setMessage(error);
      return;
    }
    if (!isTested || connectionStatus !== "success") {
      setMessage("Please test the connection before saving.");
      return;
    }

    try {
      const {
        host,
        username,
        password,
        privateKey,
        passphrase,
        oauthToken,
        oauthRefreshToken,
        role,
        warehouse,
        authMethod,
      } = snowflakeConfig;

      const payload = {
        account: user.accountId,
        host,
        username,
        role,
        warehouse,
        authMethod,
        password: authMethod === "password" ? password : undefined,
        privateKey: authMethod === "keypair" ? privateKey : undefined,
        passphrase: authMethod === "keypair" ? passphrase : undefined,
        oauthToken: authMethod === "oauth" ? oauthToken : undefined,
        oauthRefreshToken:
          authMethod === "oauth" ? oauthRefreshToken : undefined,
      };

      const res = await authFetch("/api/snowflake/configs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        setSaveLoading(false);
        setMessage("Configuration saved successfully!");
        setHasTestedSinceLastSave(false);
        localStorage.removeItem("oauthToken");
        localStorage.removeItem("oauthRefreshToken");

        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setSaveLoading(false);
        throw new Error(data.message || "Failed to save configuration.");
      }
    } catch (err) {
      console.error("Error saving config:", err);
      setMessage(`❌ ${err.message}`);
    }
  };

  const validateConfig = () => {
    const {
      host,
      username,
      password,
      privateKey,
      passphrase,
      oauthToken,
      role,
      warehouse,
      authMethod,
    } = snowflakeConfig;

    if (!host) return "Snowflake account (host) is required.";
    if (!username) return "Username is required.";
    if (!role) return "Role is required.";
    if (!warehouse) return "Warehouse is required.";

    if (authMethod === "password" && !password) return "Password is required.";
    if (authMethod === "keypair") {
      if (!privateKey) return "Private key is required.";
      if (privateKey.includes("ENCRYPTED") && !passphrase)
        return "Passphrase is required.";
    }
    if (authMethod === "oauth" && !oauthToken)
      return "OAuth token is required.";

    return null;
  };

  const handleTestConnection = async () => {
    setTestLoading(true);
    setMessage("");
    setConnectionStatus(null);

    const error = validateConfig();
    if (error) {
      setMessage(error);
      setConnectionStatus("error");
      return;
    }

    try {
      const payload = {
        account: snowflakeConfig.host,
        username: snowflakeConfig.username,
        role: snowflakeConfig.role,
        warehouse: snowflakeConfig.warehouse,
        authMethod: snowflakeConfig.authMethod,
        password:
          snowflakeConfig.authMethod === "password"
            ? snowflakeConfig.password
            : undefined,
        privateKey:
          snowflakeConfig.authMethod === "keypair"
            ? snowflakeConfig.privateKey
            : undefined,
        passphrase:
          snowflakeConfig.authMethod === "keypair"
            ? snowflakeConfig.passphrase
            : undefined,
        oauthToken:
          snowflakeConfig.authMethod === "oauth"
            ? snowflakeConfig.oauthToken
            : undefined,
        schema: "PUBLIC",
      };

      const res = await authFetch("/api/snowflake/configs/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("Content-Type");
      let data = contentType?.includes("application/json")
        ? await res.json()
        : {};

      if (res.ok && data.success) {
        setTestLoading(false);
        setConnectionStatus("success");
        setIsTested(true);
        setHasTestedSinceLastSave(true);
        localStorage.removeItem("oauthToken");
        localStorage.removeItem("oauthRefreshToken");
      } else {
        setTestLoading(false);
        throw new Error(data.message || "Connection test failed.");
      }
    } catch (err) {
      setTestLoading(false);
      console.error("Connection test error:", err);
      const preMatch = err.message.match(/<pre>([\s\S]*?)<\/pre>/i);
      setMessage(preMatch?.[1]?.trim() || err.message);
      setConnectionStatus("error");
      setIsTested(false);
    }
  };
  const handleRemoveConfig = async () => {
    setDeleteLoading(true);
    try {
      const res = await authFetch("/api/snowflake/configs/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: user.accountId }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("❌ Configuration removed successfully.");
        setIsConfigured(false);
        setIsTested(false);
        setConnectionStatus(null);
        setDeleteLoading(false);
      } else {
        setDeleteLoading(false);
        throw new Error(data.message || "Failed to remove configuration.");
      }
    } catch (err) {
      setDeleteLoading(false);
      console.error("Error removing configuration:", err);
      setMessage(`❌ ${err.message}`);
    }
  };

  return (
    <div className="sf-app-container">
      <Navbar />
      <div className="sf-main-layout">
        <div className="sf-content-area">
          <div className="sf-form-wrapper">
            <div className="dashboard-section-title">
              <Database className="section-icon" />
              <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                Snowflake Configuration
                {statusLoading ? (
                  <span className="connection-status">
                    <span className="connection-dot gray" title="Checking..." />
                    <span className="connection-text spinner-container">
                      <Loader2 className="connection-spinner" size={14} />
                      Checking...
                    </span>
                  </span>
                ) : connectionStatus === "success" || isConfigured ? (
                  <span className="connection-status">
                    <span className="connection-dot green" title="Connected" />
                    <span className="connection-text">
                      <strong>{activeMethod.toUpperCase()}</strong> Connected
                    </span>
                  </span>
                ) : (
                  <span className="connection-status">
                    <span
                      className="connection-dot gray"
                      title="Not connected"
                    />
                    <span className="connection-text">Not Connected</span>
                  </span>
                )}
              </h3>
            </div>

            <p className="users-subtitle">
              Connect your Snowflake warehouse by entering the required
              credentials below.
            </p>

            {message && (
              <div className={`sf-error-wrapper`}>
                <div
                  className={
                    message.includes("successfully")
                      ? "status-message success"
                      : "error-banner"
                  }
                >
                  {message}
                </div>
              </div>
            )}

            <div className="snowflake-config-card">
              <div className="form-group">
                <label htmlFor="authMethod">Authentication Method</label>
                <select
                  id="authMethod"
                  value={snowflakeConfig.authMethod}
                  onChange={handleChange}
                >
                  <option value="password">Password</option>
                  <option value="keypair">Key Pair</option>
                  <option value="oauth">OAuth</option>
                </select>
              </div>

              {snowflakeConfig.authMethod !== "oauth" && (
                <>
                  <div className="form-group">
                    <label htmlFor="host">
                      Snowflake Account (e.g. xy12345.region)
                    </label>
                    <input
                      type="text"
                      id="host"
                      placeholder="abc-xy12345"
                      value={snowflakeConfig.host}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="username">Snowflake Username</label>
                    <input
                      type="text"
                      id="username"
                      placeholder="e.g. integration_user"
                      value={snowflakeConfig.username}
                      onChange={handleChange}
                    />
                  </div>

                  {snowflakeConfig.authMethod === "password" && (
                    <div className="form-group">
                      <label htmlFor="password">Snowflake Password</label>
                      <input
                        type="password"
                        id="password"
                        placeholder="●●●●●●●●"
                        value={snowflakeConfig.password}
                        onChange={handleChange}
                      />
                    </div>
                  )}

                  {snowflakeConfig.authMethod === "keypair" && (
                    <>
                      <div className="form-group">
                        <label htmlFor="privateKey">Private Key</label>
                        <textarea
                          id="privateKey"
                          placeholder="Paste PEM private key here"
                          value={snowflakeConfig.privateKey}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="passphrase">Passphrase (if any)</label>
                        <input
                          type="password"
                          id="passphrase"
                          placeholder="Optional"
                          value={snowflakeConfig.passphrase}
                          onChange={handleChange}
                        />
                      </div>
                    </>
                  )}

                  <div className="form-group">
                    <label htmlFor="role">Role</label>
                    <input
                      type="text"
                      id="role"
                      placeholder="e.g. SYSADMIN"
                      value={snowflakeConfig.role}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="warehouse">Warehouse</label>
                    <input
                      type="text"
                      id="warehouse"
                      placeholder="e.g. COMPUTE_WH"
                      value={snowflakeConfig.warehouse}
                      onChange={handleChange}
                    />
                  </div>

                  {/* Move this above the button row */}
                  {connectionStatus === "success" && hasTestedSinceLastSave && (
                    <div className="connection-banner">
                      <strong>Connection successful!</strong> Now click{" "}
                      <em>Save Configuration</em> to apply and store your
                      credentials.
                    </div>
                  )}

                  <div className="button-row">
                    {connectionStatus !== "success" ? (
                      <button
                        className="sf-setup-button"
                        onClick={handleTestConnection}
                        disabled={testLoading}
                      >
                        {testLoading ? (
                          <>
                            <Loader2 className="connection-spinner" size={14} />{" "}
                            Testing...
                          </>
                        ) : (
                          "Test Configuration"
                        )}
                      </button>
                    ) : (
                      <button
                        className="setup-button"
                        onClick={handleSaveConfig}
                        disabled={
                          saveLoading ||
                          !isTested ||
                          connectionStatus !== "success"
                        }
                      >
                        {saveLoading ? (
                          <>
                            <Loader2 className="connection-spinner" size={14} />{" "}
                            Saving...
                          </>
                        ) : (
                          "Save Configuration"
                        )}
                      </button>
                    )}

                    {(connectionStatus === "success" || isConfigured) && (
                      <button
                        className="trash-icon-button"
                        onClick={handleRemoveConfig}
                        disabled={deleteLoading}
                        title="Remove Configuration"
                      >
                        {deleteLoading ? (
                          <Loader2 className="connection-spinner" size={14} />
                        ) : (
                          <Trash2 size={18} />
                        )}
                      </button>
                    )}
                  </div>
                </>
              )}

              {showRemoveConfirm && (
                <div className="modal-overlay">
                  <div className="modal-content">
                    <h4>Confirm Removal</h4>
                    <p>This will delete your Snowflake config. Are you sure?</p>
                    <div className="modal-buttons">
                      <button
                        className="cancel-btn"
                        onClick={() => setShowRemoveConfirm(false)}
                      >
                        Cancel
                      </button>
                      <button
                        className="confirm-danger-btn"
                        onClick={handleRemoveConfig}
                      >
                        Yes, Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {snowflakeConfig.authMethod === "oauth" && (
                <div className="form-group">
                  <label>OAuth Connection</label>
                  <button
                    className="setup-button"
                    onClick={() => setShowOAuthModal(true)}
                  >
                    Setup OAuth Credentials
                  </button>

                  {showOAuthModal && (
                    <OAuthSetupModal
                      onClose={() => setShowOAuthModal(false)}
                      onSuccess={() => setIsOAuthConfigured(true)}
                      onCompleteRedirect={(accountId) => {
                        const apiBase =
                          process.env.NODE_ENV === "development"
                            ? "http://localhost:3001"
                            : "";
                        const fullRedirect = `${apiBase}/api/snowflake/oauth/authorize?accountId=${accountId}`;
                        window.location.href = fullRedirect;
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SnowflakeConfigPage;
