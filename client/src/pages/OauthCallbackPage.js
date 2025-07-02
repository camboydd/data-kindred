import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import "./OAuthCallbackPage.css";

const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const hasRunRef = useRef(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const code = query.get("code");
    const stateParam = query.get("state");
    let accountId = null;

    try {
      // ✅ Properly decode and parse `state`
      if (stateParam) {
        const decoded = decodeURIComponent(stateParam);

        // New format: JSON string with accountId
        if (decoded.startsWith("{")) {
          const parsed = JSON.parse(decoded);
          accountId = parsed.accountId;
        } else {
          // Fallback: plain accountId string
          accountId = decoded;
        }
      }
    } catch (e) {
      alert("❌ Invalid OAuth state format.");
      setLoading(false);
      navigate("/snowflake");
      return;
    }

    if (!code || !accountId) {
      alert("❌ Missing required OAuth parameters.");
      setLoading(false);
      navigate("/snowflake");
      return;
    }

    const sendCode = async () => {
      try {
        const res = await fetch("/api/snowflake/oauth/callback", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code, accountId }),
        });

        const data = await res.json();
        if (res.ok) {
          alert("✅ OAuth connection successful.");
        } else {
          alert(`❌ OAuth failed: ${data.message || "Unknown error"}`);
        }
      } catch (err) {
        alert("❌ OAuth callback failed.");
      } finally {
        setLoading(false);
        navigate("/snowflake");
      }
    };

    sendCode();
  }, []);

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        {loading ? (
          <>
            <div className="spinner" />
            <h2>🔐 Finalizing OAuth setup…</h2>
            <p>This will only take a few seconds.</p>
          </>
        ) : (
          <h2>✅ Redirecting…</h2>
        )}
      </div>
    </div>
  );
};

export default OAuthCallbackPage;
