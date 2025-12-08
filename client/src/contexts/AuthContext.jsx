import React, { createContext, useContext, useEffect, useState } from "react";
import api from "../utils/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [role, setRole] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    let mounted = true;

    const verifyToken = async () => {
      const storedToken = localStorage.getItem("token");
      console.log("🔵 AUTH CONTEXT: Verifying token on mount", {
        hasToken: !!storedToken,
      });

      if (!storedToken) {
        console.log("⚠️ AUTH CONTEXT: No token found in localStorage");
        if (mounted) {
          setToken(null);
          setRole(null);
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        console.log("🔵 AUTH CONTEXT: Calling /api/auth/verify");
        const res = await api.get("/api/auth/verify");
        console.log("🔵 AUTH CONTEXT: Verify response", res.data);

        if (res.data?.valid === true) {
          console.log("✅ AUTH CONTEXT: Token is valid, setting state");
          if (mounted) {
            setToken(storedToken);
            setRole(res.data.role);
            setUser({
              email: res.data.email,
              role: res.data.role,
              id: res.data.id,
            });
          }
        } else {
          console.log(
            "🔴 AUTH CONTEXT: Token invalid (valid !== true), clearing localStorage"
          );
          localStorage.removeItem("token");
          localStorage.removeItem("role");
          if (mounted) {
            setToken(null);
            setRole(null);
            setUser(null);
          }
        }
      } catch (err) {
        console.error("❌ AUTH CONTEXT: Verify failed", {
          status: err.response?.status,
          message: err.response?.data?.message,
          error: err.message,
        });
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        if (mounted) {
          setToken(null);
          setRole(null);
          setUser(null);
        }
      } finally {
        if (mounted) {
          console.log(
            "🔵 AUTH CONTEXT: Verification complete, setting loading=false"
          );
          setLoading(false);
        }
      }
    };

    verifyToken();

    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email, password) => {
    console.log("🔵 AUTH CONTEXT: Login called", {
      email,
      passwordLength: password.length,
      passwordSample: password.substring(0, 3) + "***",
    });

    const res = await api.post("/api/auth/login", { email, password });

    console.log("🔵 AUTH CONTEXT: Login response", {
      hasToken: !!res.data?.token,
      role: res.data?.role,
      fullResponse: res.data,
    });

    if (res.data?.token) {
      const receivedToken = res.data.token;
      const userRole = res.data.role;

      // Save to localStorage first
      localStorage.setItem("token", receivedToken);
      localStorage.setItem("role", userRole);
      console.log("💾 AUTH CONTEXT: Saved to localStorage", {
        token: receivedToken.substring(0, 20) + "...",
        role: userRole,
      });

      // Then update state
      setToken(receivedToken);
      setRole(userRole);
      setUser({ email: res.data.email, role: userRole });
      console.log("✅ AUTH CONTEXT: Login successful, state updated");
    } else {
      console.error("❌ AUTH CONTEXT: No token in response", res.data);
    }

    return res.data;
  };

  const googleLogin = async (accessToken) => {
    console.log("🔵 AUTH CONTEXT: Google Login called");

    const res = await api.post("/api/auth/google", {
      access_token: accessToken,
    });

    console.log("🔵 AUTH CONTEXT: Google Login response", {
      hasToken: !!res.data?.token,
      role: res.data?.role,
      fullResponse: res.data,
    });

    if (res.data?.token) {
      const receivedToken = res.data.token;
      const userRole = res.data.role;

      // Save to localStorage first
      localStorage.setItem("token", receivedToken);
      localStorage.setItem("role", userRole);
      console.log("💾 AUTH CONTEXT: Saved to localStorage", {
        token: receivedToken.substring(0, 20) + "...",
        role: userRole,
      });

      // Then update state
      setToken(receivedToken);
      setRole(userRole);
      setUser({ email: res.data.email, role: userRole });
      console.log("✅ AUTH CONTEXT: Google Login successful, state updated");
    } else {
      console.error("❌ AUTH CONTEXT: No token in response", res.data);
    }

    return res.data;
  };

  const logout = async () => {
    console.log("🔵 AUTH CONTEXT: Logout called");
    try {
      await api.post("/api/auth/logout");
    } catch (err) {
      console.error("⚠️ AUTH CONTEXT: Logout API call failed", err);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      setToken(null);
      setRole(null);
      setUser(null);
      console.log(
        "✅ AUTH CONTEXT: Logged out, cleared localStorage and state"
      );
    }
  };

  const value = {
    token,
    accessToken: token, // For backward compatibility
    role,
    user,
    loading,
    isAuthenticated: !!token,
    login,
    googleLogin,
    logout,
  };

  console.log("🔵 AUTH CONTEXT: Current state", {
    isAuthenticated: !!token,
    loading,
    role,
    hasToken: !!token,
  });

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export default AuthContext;
