import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AgentSetup from "./pages/AgentSetup";
import CallHistory from "./components/CallHistory";
import MyNumbers from "./components/MyNumbers";
import Workplace from "./components/Workplace";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import { ToastContainer } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

function PrivateRoute({ children }) {
  const location = useLocation();
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function DashboardWrapper() {
  const { role } = useAuth();
  // Role can be 'user' or 'admin'
  if (role === "admin") {
    return <AdminDashboard />;
  }
  return <Dashboard />;
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/*"
              element={
                <PrivateRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<DashboardWrapper />} />
                      <Route path="/voice" element={<AgentSetup />} />
                      <Route path="/callHistory" element={<CallHistory />} />
                      <Route path="/phones" element={<MyNumbers />} />
                      <Route path="/workplace" element={<Workplace />} />
                    </Routes>
                  </Layout>
                </PrivateRoute>
              }
            />
          </Routes>
          <ToastContainer />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
