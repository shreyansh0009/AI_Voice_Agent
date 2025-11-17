import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/dashboard";
import AgentSetup from "./pages/AgentSetup";
import { ToastContainer } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/voice" element={<AgentSetup />} />
          </Routes>
        </Layout>
        <ToastContainer />
      </Router>
    </ErrorBoundary>
  );
}

export default App;
