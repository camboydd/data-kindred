import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import kindredLogo from "../assets/images/kindred_purple.png";
import "./SignupPage.css";

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
    highlight: true,
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

const SignupPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialPlan = searchParams.get("plan")?.toLowerCase() || "basic";
  const navigate = useNavigate();

  const [plan, setPlan] = useState(initialPlan);
  const [priceId, setPriceId] = useState(priceMap[initialPlan]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState("");

  useEffect(() => {
    setPriceId(priceMap[plan]);
    setSearchParams({ plan });
  }, [plan]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/users/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, name, company, password, plan }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Signup failed");

      setTimeout(() => {
        navigate(`/start-checkout?priceId=${priceId}`);
      }, 1500);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const evaluateStrength = (value) => {
    if (!value) return setPasswordStrength("");
    if (value.length < 6) return setPasswordStrength("weak");
    if (/[A-Z]/.test(value) && /\d/.test(value) && value.length >= 8) {
      return setPasswordStrength("strong");
    }
    return setPasswordStrength("medium");
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    evaluateStrength(e.target.value);
  };

  return (
    <div className="signupPage">
      <div className="signupPage-left">
        <img src={kindredLogo} alt="Kindred" className="signupPage-logo" />
        <h2>Create your Kindred account</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Company or Team Name"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="signupPage-passwordGroup">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Create a password"
              value={password}
              onChange={handlePasswordChange}
              required
            />
            <button
              type="button"
              className="signupPage-showPassword"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {password && (
            <div className={`signupPage-passwordStrength ${passwordStrength}`}>
              Password strength: <strong>{passwordStrength}</strong>
            </div>
          )}
          {error && <p className="signupPage-error">{error}</p>}
          {submitting && (
            <p className="signupPage-success">
              Almost there... redirecting to checkout
            </p>
          )}
          <button type="submit" disabled={submitting}>
            {submitting
              ? "Creating account..."
              : `Sign Up for ${plan.charAt(0).toUpperCase() + plan.slice(1)}`}
          </button>
        </form>
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

export default SignupPage;
