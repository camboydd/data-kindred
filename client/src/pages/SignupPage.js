import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import kindredLogo from "../assets/images/kindred.png";
import "./SignupPage.css";

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

  // Update priceId if plan changes
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

      // Show success message briefly
      setTimeout(() => {
        navigate(`/start-checkout?priceId=${priceId}`);
      }, 1500);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const togglePlan = () => {
    setPlan(plan === "basic" ? "pro" : "basic");
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
    <div className="signup-wrapper">
      <div className="signup-bg" />

      <div className="signup-card">
        <div className="auth-header">
          <img src={kindredLogo} alt="Kindred" className="signup-logo" />
        </div>

        <h2 className="brand-name">Create your Kindred account</h2>

        <p className="plan-context">
          You’re signing up for the <strong>{plan}</strong> plan.
          <br />
          <button type="button" className="toggle-plan" onClick={togglePlan}>
            Switch to {plan === "basic" ? "Pro" : "Basic"}
          </button>
        </p>

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

          <div className="password-group">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Create a password"
              value={password}
              onChange={handlePasswordChange}
              required
            />
            <button
              type="button"
              className="show-password-toggle"
              onClick={() => setShowPassword((prev) => !prev)}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {password && (
            <div className={`password-strength ${passwordStrength}`}>
              Password strength: <strong>{passwordStrength}</strong>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : `Sign Up for ${plan}`}
          </button>

          {submitting && (
            <p className="success-message">
              Almost there... redirecting to checkout
            </p>
          )}
        </form>
      </div>
    </div>
  );
};

export default SignupPage;
