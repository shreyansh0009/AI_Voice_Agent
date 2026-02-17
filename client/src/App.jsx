import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import Layout from "./components/Layout";
import AdminDashboard from "./pages/AdminDashboard";
import AgentSetup from "./pages/AgentSetup";
import CallHistory from "./components/CallHistory";
import MyNumbers from "./components/MyNumbers";
import Workplace from "./components/Workplace";
import KnowledgeBase from "./components/KnowledgeBase";
import Provider from "./components/Provider";
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

function HomeRedirect() {
  const { role } = useAuth();
  if (role === "admin") {
    return <AdminDashboard />;
  }
  return <Navigate to="/voice" replace />;
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
                      <Route path="/" element={<HomeRedirect />} />
                      <Route path="/voice" element={<AgentSetup />} />
                      <Route path="/callHistory" element={<CallHistory />} />
                      <Route path="/phones" element={<MyNumbers />} />
                      <Route path="/workplace" element={<Workplace />} />
                      <Route path="/knowledgeBase" element={<KnowledgeBase />} />
                      <Route path="/providers" element={<Provider />} />
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
