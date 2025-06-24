import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import { UserCircle } from "lucide-react";
import "./UserSettings.css";

const UserSettings = () => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info"); // "info", "error", "success"
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user?.name) {
      setFormData((prev) => ({ ...prev, name: user.name }));
    }
  }, [user]);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("");
    setLoading(true);

    const { name, currentPassword, newPassword, confirmPassword } = formData;

    if (
      (newPassword || confirmPassword || currentPassword) &&
      !currentPassword
    ) {
      setStatusType("error");
      setStatus("Current password is required to change your password.");
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatusType("error");
      setStatus("New password and confirmation do not match.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/users/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");

      setStatusType("success");
      setStatus("✅ Settings updated successfully.");
      setFormData((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      }));
    } catch (err) {
      setStatusType("error");
      setStatus(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="user-settings-page">
      <Navbar />
      <div className="user-settings-content">
        <div className="dashboard-section-title">
          <UserCircle className="section-icon" />
          <h3>User Settings</h3>
        </div>
        <p className="connectors-subtitle">
          Update your name or password. Leave password fields blank if you're
          not changing it.
        </p>

        <form className="settings-card" onSubmit={handleSubmit}>
          <div className="email-display">
            <label>Email</label>
            <p>{user?.email}</p>
          </div>

          <label>
            Name
            <input
              type="text"
              name="name"
              placeholder="Your full name"
              value={formData.name}
              onChange={handleChange}
            />
          </label>

          <label>
            Current Password
            <input
              type="password"
              name="currentPassword"
              placeholder="Required to change password"
              value={formData.currentPassword}
              onChange={handleChange}
            />
          </label>

          <label>
            New Password
            <input
              type="password"
              name="newPassword"
              placeholder="New password"
              value={formData.newPassword}
              onChange={handleChange}
            />
          </label>

          <label>
            Confirm New Password
            <input
              type="password"
              name="confirmPassword"
              placeholder="Re-enter new password"
              value={formData.confirmPassword}
              onChange={handleChange}
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : "Save Changes"}
          </button>

          {status && (
            <p className={`settings-status ${statusType}`}>{status}</p>
          )}
        </form>
      </div>
    </div>
  );
};

export default UserSettings;
