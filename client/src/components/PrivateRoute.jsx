import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  
  console.log('🔵 PRIVATE ROUTE: Checking authentication', { 
    isAuthenticated, 
    loading 
  });
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    console.log('🔴 PRIVATE ROUTE: Not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }
  
  console.log('✅ PRIVATE ROUTE: Authenticated, rendering children');
  return children;
}
