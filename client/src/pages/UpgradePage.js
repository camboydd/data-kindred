import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import kindredLogo from "../assets/images/kindred_purple.png";
import "./SignupPage.css";
import "./UpgradePage.css";
import { useAuth } from "../context/AuthContext";
import { authFetch } from "../util/authFetch";

const plans = [
  {
    name: "Basic",
    price: "$99/mo",
    planParam: "basic",
    description: "Perfect for small teams integrating a couple platforms.",
    features: ["Up to 2 connectors", "Daily syncs", "Email support"],
  },
  {
    name: "Pro",
    price: "$199/mo",
    planParam: "pro",
    description:
      "For teams that need richer integrations, manual control, and connector requests.",
    features: [
      "Up to 5 connectors",
      "Hourly scheduled syncs",
      "Developer support",
      "Manual refresh syncs",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    planParam: "enterprise",
    description: "For large teams that need flexibility, scale, and security.",
    features: [
      "Unlimited connectors",
      "On-demand + scheduled syncs",
      "Priority support",
      "Dedicated onboarding",
    ],
  },
];

const priceMap = {
  basic: process.env.REACT_APP_PRICE_ID_BASIC,
  pro: process.env.REACT_APP_PRICE_ID_PRO,
};

const UpgradePage = () => {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPlan = searchParams.get("plan")?.toLowerCase() || "pro";

  const [plan, setPlan] = useState(initialPlan);
  const [priceId, setPriceId] = useState(priceMap[initialPlan]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPriceId(priceMap[plan]);
    setSearchParams({ plan });
  }, [plan]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const encoded = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      navigate(`/login?next=${encoded}`, { replace: true });
    }
  }, [authLoading, user, navigate]);

  const handleUpgrade = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const res = await authFetch("/api/users/upgrade", {
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
    <div className="signupPage">
      <div className="signupPage-left">
        <img src={kindredLogo} alt="Kindred" className="signupPage-logo" />
        <h2>Upgrade your Kindred Plan</h2>
        <p>
          You’ve selected the <strong>{plan}</strong> plan.
        </p>
        {error && <p className="signupPage-error">{error}</p>}
        {submitting && (
          <p className="signupPage-success">Redirecting to checkout...</p>
        )}
        <button
          className="upgrade-button"
          onClick={handleUpgrade}
          disabled={submitting}
          type="button"
        >
          {submitting ? "Processing..." : `Upgrade to ${plan}`}
        </button>
      </div>

      <div className="signupPage-right">
        <h3>Choose Your Plan</h3>
        <ul className="plan-options">
          {plans.map((p) => (
            <li
              key={p.planParam}
              className={`plan-option ${
                plan === p.planParam ? "selected" : ""
              }`}
              onClick={() => setPlan(p.planParam)}
            >
              <div>
                <div className="plan-name">{p.name}</div>
                <div className="plan-price">{p.price}</div>
              </div>
              <div className="plan-description">{p.description}</div>
              <ul className="plan-features">
                {p.features.map((feat, i) => (
                  <li key={i}>✓ {feat}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default UpgradePage;
