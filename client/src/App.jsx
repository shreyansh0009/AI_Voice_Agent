import React, { Suspense } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import Layout from "./components/Layout";
import { ToastContainer } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Campaign from "./components/Campaign";

// Lazy-loaded page components — each becomes its own chunk
const AdminDashboard = React.lazy(() => import("./pages/AdminDashboard"));
const AgentSetup = React.lazy(() => import("./pages/AgentSetup"));
const CallHistory = React.lazy(() => import("./components/CallHistory"));
const MyNumbers = React.lazy(() => import("./components/MyNumbers"));
const Workplace = React.lazy(() => import("./components/Workplace"));
const KnowledgeBase = React.lazy(() => import("./components/KnowledgeBase"));
const Provider = React.lazy(() => import("./components/Provider"));
const Login = React.lazy(() => import("./pages/Login"));
const Signup = React.lazy(() => import("./pages/Signup"));
const Billings = React.lazy(() => import("./components/Billings"));
const TapToTalkDemo = React.lazy(() => import("./components/TapToTalkDemo"));
const Campaign = React.lazy(() => import("./components/Campaign"));

// Minimal loading fallback
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    </div>
  );
}

function PrivateRoute({ children }) {
  const location = useLocation();
  const { loading, isAuthenticated } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function PrivateContent() {
  const { role } = useAuth();

  if (role === "admin") {
    return <AdminDashboard />;
  }

  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/voice" replace />} />
          <Route path="/voice" element={<AgentSetup />} />
          <Route path="/callHistory" element={<CallHistory />} />
          <Route path="/phones" element={<MyNumbers />} />
          <Route path="/workplace" element={<Workplace />} />
          <Route path="/knowledgeBase" element={<KnowledgeBase />} />
          <Route path="/providers" element={<Provider />} />
          <Route path="/billing" element={<Billings />} />
          <Route path="/tap" element={<TapToTalkDemo />} />
          <Route path="/campaign" element={<Campaign />} />

        </Routes>
      </Suspense>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route
                path="/*"
                element={
                  <PrivateRoute>
                    <PrivateContent />
                  </PrivateRoute>
                }
              />
            </Routes>
          </Suspense>
          <ToastContainer />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
