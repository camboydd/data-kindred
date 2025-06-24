import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(undefined); // undefined = loading, null = not logged in, {} = user
  const [authLoading, setAuthLoading] = useState(true);
  const APP_API_URL = process.env.REACT_APP_API_URL;

  useEffect(() => {
    const checkLogin = async () => {
      try {
        const res = await fetch(`${APP_API_URL}/api/users/check-auth`, {
          credentials: "include", // This sends cookie
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error("Error checking auth:", err);
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    checkLogin();
  }, [APP_API_URL]);

  const login = async (email, password, captchaToken) => {
    try {
      const res = await fetch(`${APP_API_URL}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, captchaToken }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const message = errorData.message || "Login failed";
        const code = errorData.code || "UNKNOWN_ERROR";
        return { success: false, message, code };
      }

      // 🧠 After login, confirm cookie is registered by Chrome
      const authCheck = await fetch(`${APP_API_URL}/api/users/check-auth`, {
        credentials: "include",
      });

      if (!authCheck.ok) {
        throw new Error("Session check failed after login");
      }

      const data = await authCheck.json();
      setUser(data.user);

      return { success: true };
    } catch (err) {
      console.error("Login failed:", err);
      return { success: false, message: err.message };
    }
  };

  const logout = async () => {
    await fetch(`${APP_API_URL}/api/users/logout`, {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, authLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
