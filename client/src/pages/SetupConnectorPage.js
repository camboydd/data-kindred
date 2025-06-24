import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import { Trash2, Loader2 } from "lucide-react";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import "./SetupConnectorPage.css";

const CONNECTOR_CONFIGS = {
  nclarity: {
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        section: "Source Credentials",
        required: true,
      },
    ],
  },
  sageintacct: {
    fields: [
      { key: "userId", label: "User ID", type: "text", required: true },
      {
        key: "userPassword",
        label: "User Password",
        type: "password",
        required: true,
      },
      { key: "senderId", label: "Sender ID", type: "text", required: true },
      {
        key: "senderPassword",
        label: "Sender Password",
        type: "password",
        required: true,
      },
      { key: "companyId", label: "Company ID", type: "text", required: true },
    ],
  },
};

const SetupConnectorPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();

  const [sourceValues, setSourceValues] = useState({});
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);

  const [defaultValues, setDefaultValues] = useState({});
  const [savedSensitiveFields, setSavedSensitiveFields] = useState([]);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const config = CONNECTOR_CONFIGS[id] || { fields: [] };
  const location = useLocation();
  const connectorName =
    location.state?.name || id.charAt(0).toUpperCase() + id.slice(1);

  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Load saved config
  useEffect(() => {
    const fetchExistingConfig = async () => {
      if (authLoading || !user) return;

      try {
        const res = await fetch(`/api/connectors/${id}/config`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ accountId: user.accountId }),
        });

        if (res.ok) {
          const data = await res.json();
          const configValues = data.sourceCredentials || {};

          const sanitized = {};
          const sensitiveKeys = config.fields
            .filter((f) => f.type === "password")
            .map((f) => f.key);
          const detectedSaved = [];

          for (const key in configValues) {
            if (!sensitiveKeys.includes(key)) {
              sanitized[key] = configValues[key];
            } else if (configValues[key]) {
              detectedSaved.push(key);
            }
          }

          setSavedSensitiveFields(detectedSaved);
          setSourceValues(sanitized);
          setDefaultValues(JSON.parse(JSON.stringify(sanitized)));
        }
      } catch (err) {
        console.error("Failed to load existing config", err);
      }
    };

    fetchExistingConfig();
  }, [authLoading, user, id]);

  // Fetch status
  useEffect(() => {
    const fetchStatus = async () => {
      if (authLoading || !user) return;

      try {
        setStatusLoading(true);
        const res = await fetch(`/api/connectors/${id}/status`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ accountId: user.accountId }),
        });

        const data = await res.json();
        if (res.ok && data[id] === "connected") {
          setStatus("test-success");
        } else {
          setStatus("test-error");
        }
      } catch (err) {
        console.error("Failed to fetch connector status:", err);
        setStatus("test-error");
      } finally {
        setStatusLoading(false);
      }
    };

    fetchStatus();
  }, [authLoading, user, id]);

  const handleRemoveConfig = async () => {
    try {
      const res = await fetch(`/api/connectors/${id}/delete`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId: user.accountId }),
      });

      if (res.ok) {
        navigate("/connectors");
      } else {
        console.error("❌ Failed to remove connector config");
      }
    } catch (err) {
      console.error("❌ Error deleting connector config:", err);
    }
  };

  const handleChange = (key, value) => {
    setSourceValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setHasSubmitted(true);

    const payload = {
      accountId: user.accountId,
      connectorId: id,
      sourceCredentials: sourceValues,
    };

    try {
      const testRes = await fetch(`/api/connectors/${id}/test`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sourceCredentials: sourceValues }),
      });

      const testResult = await testRes.json();
      if (!testResult.success) {
        setStatus("test-error");
        throw new Error("Connection test failed.");
      }

      const saveRes = await fetch("/api/connectors/setup", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!saveRes.ok) throw new Error("Connector setup failed");

      setStatus("success");
      setDefaultValues(JSON.parse(JSON.stringify(sourceValues)));
      navigate("/connectors");
    } catch (err) {
      console.error("❌ Submit failed:", err);
      if (status !== "test-error") setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const isModified =
    JSON.stringify(sourceValues) !== JSON.stringify(defaultValues);

  return (
    <div className="setup-outer-wrapper">
      <Navbar />
      <div className="setup-page-center">
        <div className="setup-page-wrapper">
          <h1 className="setup-title">
            Set Up <span className="connector-name">{connectorName}</span>{" "}
            Connector
            <span className="connection-status">
              {statusLoading ? (
                <>
                  <Loader2 size={14} className="connection-spinner" />
                  <span className="connection-text">Checking...</span>
                </>
              ) : status === "test-success" ? (
                <>
                  <span className="connection-dot green" title="Connected" />
                  <span className="connection-text">Connected</span>
                </>
              ) : (
                <>
                  <span className="connection-dot gray" title="Not Connected" />
                  <span className="connection-text">Not Connected</span>
                </>
              )}
            </span>
          </h1>

          <p className="setup-subtitle">
            Enter your source credentials to begin syncing data. Snowflake
            configuration is managed separately.
          </p>

          <form className="setup-form" onSubmit={handleSubmit}>
            <fieldset className="form-section">
              <legend>Source Credentials</legend>
              {config.fields.map((field) => (
                <label key={field.key} className="setup-input-label">
                  {field.label}:
                  <input
                    type={field.type}
                    value={sourceValues[field.key] || ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    required={field.required}
                  />
                  {field.type === "password" &&
                    savedSensitiveFields.includes(field.key) && (
                      <span className="saved-note">
                        Saved (Re-enter to update)
                      </span>
                    )}
                </label>
              ))}
            </fieldset>

            <div className="setup-buttons">
              <button
                type="submit"
                className="setup-submit-button"
                disabled={loading}
              >
                {loading
                  ? "Setting up..."
                  : status === "test-success"
                  ? "Submit New Credentials"
                  : "Start Integration"}
              </button>
            </div>

            {showRemoveConfirm && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <h4>Confirm Removal</h4>
                  <p>This will delete your connector config. Are you sure?</p>
                  <div className="modal-buttons">
                    <button
                      className="cancel-btn"
                      onClick={() => setShowRemoveConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="confirm-danger-btn"
                      onClick={handleRemoveConfig}
                    >
                      Yes, Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
          {status === "test-success" && (
            <div className="trash-button-wrapper">
              <button
                type="button" // <-- This is critical
                className="trash-icon-button"
                onClick={() => setShowRemoveConfirm(true)}
                title="Remove Connector Configuration"
              >
                <Trash2 size={18} />
              </button>
            </div>
          )}

          {status === "success" && (
            <p className="status-msg success-msg">
              Connector setup successfully!
            </p>
          )}
          {status === "error" && (
            <p className="status-msg error-msg">Failed to set up connector.</p>
          )}
          {hasSubmitted && status === "test-error" && (
            <p className="status-msg error-msg">
              Connection test failed. Please check your credentials.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupConnectorPage;
