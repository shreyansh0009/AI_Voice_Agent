import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Try to refresh session on mount (uses httpOnly refresh cookie)
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        // server exposes POST /api/auth/refresh-token (refresh handling)
        const res = await api.post('/api/auth/refresh-token');
        if (!mounted) return;
        if (res.data?.accessToken) {
          setAccessToken(res.data.accessToken);
          setRole(res.data.role || null);
        } else {
          setAccessToken(null);
          setRole(null);
        }
      } catch (err) {
        setAccessToken(null);
        setRole(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });
    if (res.data?.accessToken) {
      setAccessToken(res.data.accessToken);
      setRole(res.data.role || null);
    }
    return res.data;
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
    } finally {
      setAccessToken(null);
      setRole(null);
    }
  };

  const value = {
    accessToken,
    role,
    loading,
    isAuthenticated: !!accessToken,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
