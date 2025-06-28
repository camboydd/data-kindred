import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import kindredLogo from "../assets/images/kindred.png";
import "./SignupPage.css"; // Reuse same styles for consistency
import { useAuth } from "../context/AuthContext";

const priceMap = {
  basic: process.env.REACT_APP_PRICE_ID_BASIC,
  pro: process.env.REACT_APP_PRICE_ID_PRO,
};

const UpgradePage = () => {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const initialPlan = searchParams.get("plan")?.toLowerCase() || "pro";

  const [plan, setPlan] = useState(initialPlan);
  const [priceId, setPriceId] = useState(priceMap[initialPlan]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPriceId(priceMap[plan]);
  }, [plan]);

  // 🚨 Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      const encoded = encodeURIComponent(`/upgrade?plan=${plan}`);
      navigate(`/login?next=${encoded}`);
    }
  }, [authLoading, user, plan, navigate]);

  const handleUpgrade = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/users/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upgrade failed");

      setTimeout(() => {
        navigate(`/start-checkout?priceId=${priceId}`);
      }, 1500);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="signup-wrapper">
      <div className="signup-bg" />

      <div className="signup-card">
        <div className="auth-header">
          <img src={kindredLogo} alt="Kindred" className="signup-logo" />
        </div>

        <h2 className="brand-name">Upgrade Your Kindred Plan</h2>

        <p className="plan-context">
          You're upgrading to the <strong>{plan}</strong> plan.
        </p>

        {error && <p className="error">{error}</p>}

        <button onClick={handleUpgrade} disabled={submitting}>
          {submitting ? "Redirecting to checkout..." : `Upgrade to ${plan}`}
        </button>
      </div>
    </div>
  );
};

export default UpgradePage;
