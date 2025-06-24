import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import kindredLogo from "../assets/images/kindred_purple.png";
import "./LoginPage.css"; // reusing styles

const SetupPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const token = searchParams.get("token");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/api/users/setup-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token, password }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Password setup failed");

      setSuccess(true);
      setTimeout(() => navigate("/"), 2500);
    } catch (err) {
      setError(err.message);
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
        <p className="tagline">Create Your Password</p>

        {!success ? (
          <form onSubmit={handleSubmit} className="login-form">
            <label>New Password</label>
            <input
              type="password"
              placeholder="Enter a secure password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">Set Password</button>
            {error && <p className="error-text">{error}</p>}
          </form>
        ) : (
          <p style={{ color: "#14b8a6", fontWeight: "600" }}>
            ✅ Password created! Redirecting to login...
          </p>
        )}
      </div>
    </div>
  );
};

export default SetupPasswordPage;
