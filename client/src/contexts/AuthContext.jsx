import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(localStorage.getItem('accessToken'));
  const [role, setRole] = useState(localStorage.getItem('role'));
  const [loading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    let mounted = true;
    const verifyToken = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        if (mounted) setLoading(false);
        return;
      }
      
      try {
        const res = await api.get('/api/auth/verify');
        if (mounted && res.data?.valid) {
          setAccessToken(token);
          setRole(res.data.role);
        } else {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('role');
          setAccessToken(null);
          setRole(null);
        }
      } catch (err) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('role');
        setAccessToken(null);
        setRole(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    verifyToken();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });
    if (res.data?.accessToken) {
      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('role', res.data.role);
      setAccessToken(res.data.accessToken);
      setRole(res.data.role);
    }
    return res.data;
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('role');
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
