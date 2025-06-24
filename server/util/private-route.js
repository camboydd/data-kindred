import React from "react";
import { Navigate } from "react-router-dom";

const PrivateRoute = ({ isLoggedIn, children }) => {
  const token = localStorage.getItem("token");

  // If no token or not logged in, redirect to login
  if (!isLoggedIn || !token) {
    // Optional: clear storage to prevent stale sessions
    localStorage.removeItem("token");
    sessionStorage.removeItem("isLoggedIn");
    return <Navigate to="/" replace />;
  }

  return children;
};

export default PrivateRoute;
