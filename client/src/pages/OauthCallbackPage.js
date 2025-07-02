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
    const accountId = query.get("state"); // plain string, no base64 decoding
    const token = localStorage.getItem("token");

    if (!code || !accountId || !token) {
      alert("❌ Missing required OAuth parameters.");
      setLoading(false);
      navigate("/snowflake");
      return;
    }

    const sendCode = async () => {
      if (hasRunRef.current) return;
      hasRunRef.current = true;

      try {
        const res = await fetch("/api/snowflake/oauth/callback", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
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
        console.error("❌ OAuth network error:", err);
        alert("❌ OAuth callback failed. See console for details.");
      } finally {
        setLoading(false);
        navigate("/snowflake");
      }
    };

    sendCode();
  }, [navigate]);

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
