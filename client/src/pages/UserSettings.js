import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import { User, Lock, CreditCard, RefreshCcw, LogOut } from "lucide-react";
import { authFetch } from "../util/authFetch";
import "./UserSettings.css";

const UserSettings = () => {
  const { user, refreshUser } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

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
      const res = await authFetch("/api/users/update", {
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

      await refreshUser();
    } catch (err) {
      setStatusType("error");
      setStatus(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openBillingPortal = async () => {
    try {
      const res = await authFetch("/api/account/portal", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      alert("Failed to open billing portal.");
    }
  };

  const cancelSubscription = async () => {
    const confirmCancel = window.confirm(
      "Are you sure you want to cancel your subscription?"
    );
    if (!confirmCancel) return;

    try {
      const res = await authFetch("/api/account/cancel-subscription", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      alert(data.message);
      await refreshUser();
    } catch (err) {
      alert("Failed to cancel subscription.");
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshUser();
      alert("Plan info refreshed.");
    } catch (err) {
      alert("Failed to refresh user plan.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="user-settings-page">
      <Navbar />
      <div className="user-settings-content">
        <div className="settings-header">
          <h2>Account Settings</h2>
          <p className="settings-subtitle">
            Manage your profile and billing preferences
          </p>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${
              activeTab === "profile" ? "active" : ""
            }`}
            onClick={() => setActiveTab("profile")}
          >
            <User size={16} style={{ marginRight: "6px" }} />
            Profile
          </button>
          <button
            className={`settings-tab ${
              activeTab === "password" ? "active" : ""
            }`}
            onClick={() => setActiveTab("password")}
          >
            <Lock size={16} style={{ marginRight: "6px" }} />
            Password
          </button>
          <button
            className={`settings-tab ${
              activeTab === "billing" ? "active" : ""
            }`}
            onClick={() => setActiveTab("billing")}
          >
            <CreditCard size={16} style={{ marginRight: "6px" }} />
            Billing
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Profile Tab */}
          <div
            className={`settings-tab-content ${
              activeTab === "profile" ? "active" : ""
            }`}
          >
            <div className="settings-section">
              <div className="settings-section-title">
                <User size={18} style={{ marginRight: "8px" }} />
                Profile
              </div>
              <div className="settings-grid">
                <label>Email</label>
                <p className="readonly-text">{user?.email}</p>

                <label>Full Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Your full name"
                />
              </div>
              <div className="settings-buttons">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={loading}
                >
                  {loading ? <span className="spinner" /> : "Save Changes"}
                </button>
                {status && (
                  <p className={`settings-status ${statusType}`}>{status}</p>
                )}
              </div>
            </div>
          </div>

          {/* Password Tab */}
          <div
            className={`settings-tab-content ${
              activeTab === "password" ? "active" : ""
            }`}
          >
            <div className="settings-section">
              <div className="settings-section-title">
                <Lock size={18} style={{ marginRight: "8px" }} />
                Change Password
              </div>
              <div className="settings-grid">
                <label>Current Password</label>
                <input
                  type="password"
                  name="currentPassword"
                  value={formData.currentPassword}
                  onChange={handleChange}
                  placeholder="Current password"
                />
                <label>New Password</label>
                <input
                  type="password"
                  name="newPassword"
                  value={formData.newPassword}
                  onChange={handleChange}
                  placeholder="New password"
                />
                <label>Confirm Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirm new password"
                />
              </div>
              <div className="settings-buttons">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={loading}
                >
                  {loading ? <span className="spinner" /> : "Update Password"}
                </button>
                {status && (
                  <p className={`settings-status ${statusType}`}>{status}</p>
                )}
              </div>
            </div>
          </div>

          {/* Billing Tab */}
          <div
            className={`settings-tab-content ${
              activeTab === "billing" ? "active" : ""
            }`}
          >
            <div className="settings-section">
              <div className="settings-section-title">
                <CreditCard size={18} style={{ marginRight: "8px" }} />
                Billing
              </div>
              <div className="settings-grid">
                <label>Plan</label>
                <p className="readonly-text">
                  {user?.plan || "Unknown"}
                  <button
                    className="refresh-button"
                    onClick={handleManualRefresh}
                    disabled={refreshing}
                    title="Refresh plan"
                  >
                    <RefreshCcw size={14} />
                  </button>
                </p>

                <label>Billing Portal</label>
                <button onClick={openBillingPortal} className="primary-button">
                  <CreditCard size={16} style={{ marginRight: "6px" }} />
                  Manage Billing
                </button>

                <label>Subscription</label>
                <button onClick={cancelSubscription} className="danger-button">
                  <LogOut size={16} style={{ marginRight: "6px" }} />
                  Cancel Subscription
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserSettings;
