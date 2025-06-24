import React, { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import kindredLogo from "../assets/images/kindred_purple.png";
import "./ForgotPasswordPage.css"; // Reuse LoginPage.css for styling

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError(null);

    try {
      await axios.post("/api/users/request-password-reset", { email });
      setMessage(
        "If an account exists, a reset link has been sent to your email."
      );
    } catch {
      setError("Something went wrong. Please try again later.");
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-bg floating-bg" />

      <div className="login-box">
        <div className="auth-header">
          <img src={kindredLogo} alt="Kindred Logo" className="auth-logo" />
          <h1 className="brand-name">Kindred</h1>
        </div>

        <p className="tagline">Reset your password to get back in.</p>

        <form onSubmit={handleSubmit} className="login-form">
          <label>Email Address</label>
          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <button type="submit">Send Reset Link</button>

          {message && <p className="success-message">{message}</p>}
          {error && <p className="error-text">{error}</p>}

          <Link to="/" className="link-button">
            Back to Login
          </Link>
        </form>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
