import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ReCAPTCHA from "react-google-recaptcha";
import kindredLogo from "../assets/images/kindred.png";
import "./LoginPage.css";
import { useLocation } from "react-router-dom";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { login } = useAuth();
  const [captchaToken, setCaptchaToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  const nextPath =
    new URLSearchParams(location.search).get("next") || "/dashboard";

  useEffect(() => {
    if (error) {
      const timeout = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timeout);
    }
  }, [error]);

  const handleCaptcha = (value) => {
    setCaptchaToken(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true); // 🔄 Start loading

    const result = await login(email, password, captchaToken);

    setLoading(false); // ✅ End loading

    if (result.success) {
      navigate(nextPath);
    } else {
      switch (result.code) {
        case "USER_NOT_FOUND":
          setError("No user found with that email.");
          break;
        case "INVALID_PASSWORD":
          setError("Incorrect password. Please try again.");
          break;
        case "CAPTCHA_MISSING":
          setError("Please complete the CAPTCHA.");
          break;
        case "CAPTCHA_FAIL":
          setError("CAPTCHA verification failed. Try again.");
          break;
        default:
          setError(result.message || "Login failed. Please try again.");
      }
    }
  };

  return (
    <div className="login-split-wrapper">
      <div className="login-left-panel">
        <div className="left-panel-content">
          <div className="logo-title-row">
            <img
              src={kindredLogo}
              alt="Kindred Logo"
              className="login-brand-logo"
            />
            <span className="brand-title">Kindred</span>
          </div>

          <h2 className="login-heading">Welcome back!</h2>
          <p className="login-subtitle">Sign in to access your account.</p>
        </div>
      </div>

      <div className="login-right-panel">
        <form onSubmit={handleSubmit} className="login-form">
          <h3 className="login-header">
            Sign into <span className="login-title">Kindred</span>
          </h3>

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="login-actions">
            <a href="/forgot-password" className="forgot-link">
              Forgot password?
            </a>
          </div>

          {error && <p className="error-message">{error}</p>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? <span className="login-spinner" /> : "Sign In"}
          </button>

          {/*<p className="signup-link">
            Don’t have an account? <a href="/signup">Sign up now</a>
          </p>*/}
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
