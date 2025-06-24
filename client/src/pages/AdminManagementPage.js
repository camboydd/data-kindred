import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import "./AdminManagementPage.css";

const AdminManagementPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [newAccountName, setNewAccountName] = useState("");
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    role: "member",
  });

  useEffect(() => {
    fetchAccounts();
    fetchUsers();
  }, []);

  const fetchAccounts = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/accounts", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      setAccounts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching accounts:", err);
      setAccounts([]);
    }
  };

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/users", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching users:", err);
      setUsers([]);
    }
  };

  const handleAddAccount = async () => {
    if (!newAccountName) return;
    const token = localStorage.getItem("token");
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: newAccountName }),
    });
    if (res.ok) {
      setNewAccountName("");
      fetchAccounts();
    }
  };

  const handleAddUser = async () => {
    if (!selectedAccount || !newUser.email) return;
    const token = localStorage.getItem("token");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_id: selectedAccount,
        ...newUser,
      }),
    });
    if (res.ok) {
      setNewUser({ name: "", email: "", role: "member" });
      fetchUsers();
    }
  };

  const handleRunEtl = async () => {
    try {
      const res = await fetch(`/api/run/all`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        alert(`✅ ETL started for all active connectors`);
      } else {
        const errorText = await res.text();
        alert(`❌ Failed to start ETL for all: ${errorText}`);
      }
    } catch (err) {
      console.error("ETL error:", err);
      alert(`❌ Error starting ETL for all`);
    }
  };
  const handleRefreshForAccount = async (accountId) => {
    try {
      const res = await fetch(`/api/run/refresh/${accountId}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        alert(`🔁 Full refresh started for account ${accountId}`);
      } else {
        const errorText = await res.text();
        alert(`❌ Failed to refresh account ${accountId}: ${errorText}`);
      }
    } catch (err) {
      console.error("Refresh error:", err);
      alert(`❌ Error refreshing account ${accountId}`);
    }
  };

  const handleDeleteAccount = async (accountId) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this account and all users?"
      )
    )
      return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/accounts/${accountId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        fetchAccounts();
        fetchUsers();
      } else {
        const errorText = await res.text();
        alert(`❌ Failed to delete account: ${errorText}`);
      }
    } catch (err) {
      console.error("Delete account error:", err);
      alert("❌ Error deleting account");
    }
  };
  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Delete this user?")) return;
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const errorText = await res.text();
        alert(`❌ Failed to delete user: ${errorText}`);
      }
    } catch (err) {
      console.error("Delete user error:", err);
      alert("❌ Error deleting user");
    }
  };

  return (
    <div className="app-container">
      <Navbar />
      <div className="main-layout">
        <div className="content-area">
          <h2>Admin Management</h2>

          <section className="admin-section">
            <h3>Accounts</h3>
            <div className="input-row">
              <input
                type="text"
                placeholder="New Account Name"
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
              />
              <button className="admin-button" onClick={handleAddAccount}>
                Add Account
              </button>
            </div>
            <ul className="account-list">
              {Array.isArray(accounts) && accounts.length > 0 ? (
                accounts.map((acct) => (
                  <li
                    key={acct.id}
                    className={selectedAccount === acct.id ? "selected" : ""}
                  >
                    <div
                      onClick={() => setSelectedAccount(acct.id)}
                      className="account-info"
                    >
                      {acct.name} ({acct.id})
                    </div>
                    <button
                      className="refresh-button admin-button"
                      onClick={() => handleRefreshForAccount(acct.id)}
                    >
                      Refresh
                    </button>
                    <button
                      className="admin-button delete-button"
                      onClick={() => handleDeleteAccount(acct.id)}
                    >
                      Delete
                    </button>
                  </li>
                ))
              ) : (
                <li>No accounts found.</li>
              )}
            </ul>
          </section>

          <section className="admin-section">
            <h3>Users for Selected Account</h3>
            {selectedAccount ? (
              <>
                <div className="input-grid">
                  <input
                    type="text"
                    placeholder="Name"
                    value={newUser.name}
                    onChange={(e) =>
                      setNewUser({ ...newUser, name: e.target.value })
                    }
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={newUser.email}
                    onChange={(e) =>
                      setNewUser({ ...newUser, email: e.target.value })
                    }
                  />
                  <select
                    value={newUser.role}
                    onChange={(e) =>
                      setNewUser({ ...newUser, role: e.target.value })
                    }
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button className="admin-button" onClick={handleAddUser}>
                    Add User
                  </button>
                </div>

                <div className="user-list-section">
                  <h4>Current Users</h4>
                  {Array.isArray(users) &&
                  users.filter((u) => u.account_id === selectedAccount).length >
                    0 ? (
                    <ul className="user-list">
                      {users
                        .filter((u) => u.account_id === selectedAccount)
                        .map((u) => (
                          <li key={u.id}>
                            <strong>{u.name || u.email}</strong> —{" "}
                            <em>{u.role}</em>
                            <button
                              className="admin-button delete-button"
                              onClick={() => handleDeleteUser(u.id)}
                            >
                              🗑
                            </button>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p>No users found for this account.</p>
                  )}
                </div>
              </>
            ) : (
              <p>Select an account to manage users.</p>
            )}
          </section>
          <div className="etl-button-container">
            <button className="admin-button" onClick={handleRunEtl}>
              Run ETL for All Accounts
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminManagementPage;
