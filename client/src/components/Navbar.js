import React, { useState, useRef, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  LineChart,
  Plug,
  Database,
  Shield,
  ScrollText,
  UserCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import "./Navbar.css";
import kindredLogo from "../assets/images/kindred_purple.png";

const Navbar = () => {
  const navigate = useNavigate();
  const { instance, accounts } = useMsal();
  const { user, logout } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef();

  const handleLogout = async () => {
    try {
      await fetch("/api/users/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Error logging out:", err);
    }

    await logout();

    if (accounts.length > 0) {
      await instance.logoutPopup({
        postLogoutRedirectUri: window.location.origin,
      });
    } else {
      navigate("/", { replace: true });
    }
  };

  const handleUserSettings = () => {
    navigate("/user-settings");
    setShowDropdown(false);
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navLinks = [
    {
      to: "/dashboard",
      icon: <LineChart size={16} className="icon" />,
      label: "Dashboard",
    },
    {
      to: "/connectors",
      icon: <Plug size={16} className="icon" />,
      label: "Connectors",
    },
    {
      to: "/snowflake",
      icon: <Database size={16} className="icon" />,
      label: "Snowflake",
    },
    {
      to: "/auditlogs",
      icon: <ScrollText size={16} className="icon" />,
      label: "Audit Logs",
    },
    {
      to: "/sync-management",
      icon: <Database size={16} className="icon" />,
      label: "Sync Management",
    },
  ];

  if (user?.role?.toLowerCase() === "developer") {
    navLinks.push({
      to: "/adminmanagement",
      icon: <Shield size={16} className="icon" />,
      label: "Admin",
    });
  }

  return (
    <nav className="sidebar">
      <div>
        {/* Logo */}
        <div className="nav-logo-container">
          <div className="nav-logo diva-logo">
            <img
              src={kindredLogo}
              alt="Kindred Logo"
              className="nav-logo-icon"
            />
            <span className="diva-main">Kindred</span>
          </div>
        </div>

        {/* Links */}
        <div className="nav-left-group top-links">
          {navLinks.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? "sidebar-link active" : "sidebar-link"
              }
            >
              <div className="nav-item-content">
                {icon}
                <span className="label">{label}</span>
              </div>
            </NavLink>
          ))}
        </div>
      </div>

      {/* User Dropdown */}
      <div className="user-dropdown-container" ref={dropdownRef}>
        <button
          className="user-icon-btn"
          onClick={() => setShowDropdown((prev) => !prev)}
        >
          <UserCircle size={28} />
        </button>
        {showDropdown && (
          <div className="user-dropdown-menu">
            <button onClick={handleUserSettings}>User Settings</button>
            <button onClick={handleLogout}>Logout</button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
