import axios from "axios";
import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export const useLogout = () => {
  const { logout } = useContext(AuthContext);
  return logout;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(undefined);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const res = await axios.get("/api/users/check-auth", {
          withCredentials: true,
        });
        // ✅ Make sure plan is included in response
        setUser(res.data.user);
      } catch (err) {
        console.error("Error checking auth:", err);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    checkLogin();
  }, []);

  const login = async (email, password, captchaToken) => {
    try {
      await axios.post(
        "/api/users/login",
        { email, password, captchaToken },
        { withCredentials: true }
      );

      const res = await axios.get("/api/users/check-auth", {
        withCredentials: true,
      });
      setUser(res.data.user); // ✅ Includes plan

      return { success: true };
    } catch (err) {
      console.error("Login failed:", err);
      return {
        success: false,
        message: err.response?.data?.message || "Login failed",
      };
    }
  };

  const logout = async () => {
    try {
      await axios.post("/api/users/logout");
    } catch (err) {
      console.warn("Logout error:", err);
    } finally {
      setUser(null);
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, authLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
