import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/dashboard";
import AgentSetup from "./pages/AgentSetup";

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/voice" element={<AgentSetup />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
