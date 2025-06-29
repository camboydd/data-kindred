import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  Navigate,
} from "react-router-dom";
import NotFoundPage from "./pages/NotFoundPage";

import DashboardPage from "./pages/DashboardPage";
import ConnectorsPage from "./pages/ConnectorsPage";
import SetupConnectorPage from "./pages/SetupConnectorPage";
import SnowflakeConfigPage from "./pages/SnowflakeConfigPage";
import SyncManagementPage from "./pages/SyncManagementPage";
import LoginPage from "./pages/LoginPage";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import AdminManagementPage from "./pages/AdminManagementPage";
import SetupPasswordPage from "./pages/SetupPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import RequestAccessPage from "./pages/RequestAccessPage";
import OAuthCallbackPage from "./pages/OauthCallbackPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import CookiePolicyPage from "./components/CookiePolicyPage";
import PrivacyPolicyPage from "./components/PrivacyPolicyPage";
import TermsPage from "./components/TermsPage";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import { useAuth } from "./context/AuthContext";

import UpgradePage from "./pages/UpgradePage";
import CheckoutSuccessPage from "./pages/CheckoutSuccessPage";

import "./App.css";
import UserSettings from "./pages/UserSettings";
import SignupPage from "./pages/SignupPage";

const AppLayout = () => {
  const { user, authLoading } = useAuth();
  const location = useLocation();
  const { pathname } = location;

  if (authLoading) return null; // ⛔ Don't render routes until auth is resolved

  return (
    <div className="app-container">
      {user && pathname !== "/upgrade" && <Navbar />}

      <div className={user && pathname !== "/upgrade" ? "routes-wrapper" : ""}>
        <Routes>
          {/* Public Routes (only shown if not logged in) */}
          {!user && (
            <>
              <Route path="/" element={<LoginPage />} />
              <Route
                path="/checkout-success"
                element={<CheckoutSuccessPage />}
              />
              <Route path="/setup-password" element={<SetupPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/request-access" element={<RequestAccessPage />} />
              <Route
                path="/snowflake/oauth/callback"
                element={<OAuthCallbackPage />}
              />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </>
          )}
          {/* ✅ Always available */}
          <Route path="/upgrade" element={<UpgradePage />} />
          {/* Private Routes (only shown if logged in) */}
          {user && (
            <>
              <Route
                path="/dashboard"
                element={
                  <PrivateRoute>
                    <DashboardPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/connectors"
                element={
                  <PrivateRoute>
                    <ConnectorsPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/connectors/:id/setup"
                element={
                  <PrivateRoute>
                    <SetupConnectorPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/snowflake"
                element={
                  <PrivateRoute>
                    <SnowflakeConfigPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/adminmanagement"
                element={
                  <PrivateRoute>
                    <AdminManagementPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/auditlogs"
                element={
                  <PrivateRoute>
                    <AuditLogsPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/sync-management"
                element={
                  <PrivateRoute>
                    <SyncManagementPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/cookie-policy"
                element={
                  <PrivateRoute>
                    <CookiePolicyPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/privacy-policy"
                element={
                  <PrivateRoute>
                    <PrivacyPolicyPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/terms"
                element={
                  <PrivateRoute>
                    <TermsPage />
                  </PrivateRoute>
                }
              />
              <Route
                path="/user-settings"
                element={
                  <PrivateRoute>
                    <UserSettings />
                  </PrivateRoute>
                }
              />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </>
          )}
        </Routes>

        {!user && <Footer />}
      </div>

      <div className="small-screen-message">
        <div className="small-screen-box">
          <h1>Screen Too Small</h1>
          <p>This app is optimized for desktop and larger tablets.</p>
          <p>Please revisit on a larger screen to access Kindred Data.</p>
        </div>
      </div>
    </div>
  );
};

const App = () => (
  <AuthProvider>
    <Router>
      <AppLayout />
    </Router>
  </AuthProvider>
);

export default App;
