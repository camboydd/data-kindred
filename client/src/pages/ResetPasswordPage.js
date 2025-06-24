import React, { useState } from "react";
import axios from "axios";
import { useLocation, useNavigate } from "react-router-dom";
import kindredLogo from "../assets/images/kindred_purple.png";
import "./ResetPasswordPage.css";

const ResetPasswordPage = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get("token");

  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await axios.post(`/api/users/reset-password?token=${token}`, {
        password: newPassword, // not newPassword: newPassword
      });

      setSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      setError(err.response?.data?.message || "Password reset failed.");
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <img src={kindredLogo} alt="Kindred Logo" className="auth-logo" />
          <h1 className="brand-name">Kindred</h1>
        </div>
        <p className="tagline">Reset Your Password</p>
        {success ? (
          <p className="success-message">
            Password reset successfully! Redirecting…
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <button type="submit" className="auth-button">
              Reset Password
            </button>
            {error && <p className="error-message">{error}</p>}
          </form>
        )}
        <a href="/login" className="link-button">
          Back to Login
        </a>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
