import React, { useState, useEffect } from "react";
import {
  Users,
  Activity,
  DollarSign,
  Settings,
  BarChart2,
  Bell,
  LogOut,
  ChevronDown,
  ChevronRight,
  FileText,
  MessageSquare,
  Bot,
} from "lucide-react";
import api from "../utils/api";
import { useAuth } from "../contexts/AuthContext";

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const [view, setView] = useState("overview"); // 'overview' | 'users'
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeAgents: 0,
    systemHealth: "Good",
    revenue: 0,
    recentActivity: [],
  });
  const [usersDetails, setUsersDetails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Expansion states for drill-down
  const [expandedUsers, setExpandedUsers] = useState({});
  const [expandedAgents, setExpandedAgents] = useState({});

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (view === "users") {
      fetchUsersDetails();
    }
  }, [view]);

  const fetchStats = async () => {
    try {
      const res = await api.get("/api/admin/stats");
      if (res.data) {
        setStats({
          totalUsers: res.data.totalUsers,
          activeAgents: res.data.activeAgents,
          systemHealth: res.data.systemHealth || "Good",
          revenue: res.data.revenue,
          recentActivity: res.data.recentActivity || [],
        });
      }
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch admin stats", error);
      setLoading(false);
    }
  };

  const fetchUsersDetails = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/admin/users-details");
      setUsersDetails(res.data || []);
      setLoading(false);
    } catch (error) {
      console.error("Failed to fetch users details", error);
      setError("Failed to load user details");
      setLoading(false);
    }
  };

  const toggleUser = (userId) => {
    setExpandedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const toggleAgent = (agentId) => {
    setExpandedAgents((prev) => ({
      ...prev,
      [agentId]: !prev[agentId],
    }));
  };

  const StatCard = ({ title, value, icon: Icon, color, trend, onClick }) => (
    <div
      onClick={onClick}
      className={`bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all ${
        onClick ? "cursor-pointer active:scale-95" : ""
      }`}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-gray-500 text-sm font-medium mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
          {trend && (
            <p
              className={`text-xs mt-2 font-medium ${
                trend >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {trend > 0 ? "+" : ""}
              {trend}% from last month
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );

  const renderOverview = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Users"
          value={loading ? "..." : stats.totalUsers}
          icon={Users}
          color="bg-blue-500"
          trend={12}
          onClick={() => setView("users")}
        />
        <StatCard
          title="Active Agents"
          value={loading ? "..." : stats.activeAgents}
          icon={Activity}
          color="bg-purple-500"
          trend={5}
        />
        <StatCard
          title="Revenue"
          value={loading ? "..." : `$${stats.revenue.toLocaleString()}`}
          icon={DollarSign}
          color="bg-green-500"
          trend={8.5}
        />
        <StatCard
          title="System Health"
          value={loading ? "..." : stats.systemHealth}
          icon={BarChart2}
          color="bg-orange-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">
            Recent Activity
          </h3>
          <div className="space-y-4">
            {stats.recentActivity?.length > 0 ? (
              stats.recentActivity.map((activity, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-lg transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-sm font-bold">
                    {activity.type === "User Created" ? "U" : "A"}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {activity.description}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(activity.time).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No recent activity found.</p>
            )}
          </div>
        </div>

        <div className="bg-linear-to-br from-[#5c469c] to-[#4a368c] p-6 rounded-2xl shadow-lg run-through text-white">
          <h3 className="text-lg font-bold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setView("users")}
              className="bg-white/10 hover:bg-white/20 p-4 rounded-xl text-left transition-colors backdrop-blur-sm border border-white/10"
            >
              <Users className="mb-3 w-6 h-6" />
              <span className="font-semibold block">Manage Users</span>
            </button>
            <button className="bg-white/10 hover:bg-white/20 p-4 rounded-xl text-left transition-colors backdrop-blur-sm border border-white/10">
              <Activity className="mb-3 w-6 h-6" />
              <span className="font-semibold block">View All Agents</span>
            </button>
            <button className="bg-white/10 hover:bg-white/20 p-4 rounded-xl text-left transition-colors backdrop-blur-sm border border-white/10">
              <Settings className="mb-3 w-6 h-6" />
              <span className="font-semibold block">Global Config</span>
            </button>
            <button className="bg-white/10 hover:bg-white/20 p-4 rounded-xl text-left transition-colors backdrop-blur-sm border border-white/10">
              <BarChart2 className="mb-3 w-6 h-6" />
              <span className="font-semibold block">Analytics Report</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const renderUsersList = () => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-100 flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900">User Management</h3>
        <button
          onClick={() => setView("overview")}
          className="text-sm text-[#5c469c] font-medium hover:underline"
        >
          Back to Overview
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading details...</div>
      ) : error ? (
        <div className="p-8 text-center text-red-500">{error}</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {usersDetails.map((u) => (
            <div key={u._id} className="group">
              <div
                className="p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => toggleUser(u._id)}
              >
                <div className="flex items-center gap-3">
                  {expandedUsers[u._id] ? (
                    <ChevronDown size={20} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={20} className="text-gray-400" />
                  )}
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                    {u.email[0].toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{u.email}</h4>
                    <p className="text-xs text-gray-500">
                      ID: {u._id} • Joined:{" "}
                      {new Date(u.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      u.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {u.role.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-500">
                    {u.agents.length} Agents
                  </span>
                </div>
              </div>

              {/* Agents List Area */}
              {expandedUsers[u._id] && (
                <div className="bg-gray-50 p-4 pl-12 border-t border-gray-100">
                  {u.agents.length > 0 ? (
                    <div className="space-y-4">
                      {u.agents.map((agent) => (
                        <div
                          key={agent._id}
                          className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm"
                        >
                          <div
                            className="p-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                            onClick={() => toggleAgent(agent._id)}
                          >
                            <div className="flex items-center gap-2">
                              {expandedAgents[agent._id] ? (
                                <ChevronDown
                                  size={16}
                                  className="text-gray-400"
                                />
                              ) : (
                                <ChevronRight
                                  size={16}
                                  className="text-gray-400"
                                />
                              )}
                              <Bot size={18} className="text-[#5c469c]" />
                              <span className="font-semibold text-gray-800">
                                {agent.name}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full ${
                                  agent.status === "active"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-yellow-100 text-yellow-700"
                                }`}
                              >
                                {agent.status}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400">
                              {agent.files.length} Files
                            </span>
                          </div>

                          {/* Agent Details Area */}
                          {expandedAgents[agent._id] && (
                            <div className="p-4 border-t border-gray-100 text-sm space-y-4">
                              <div>
                                <h6 className="flex items-center gap-2 font-semibold text-gray-700 mb-1">
                                  <MessageSquare size={14} /> Welcome Message
                                </h6>
                                <p className="text-gray-600 bg-gray-50 p-2 rounded border border-gray-100">
                                  {agent.welcome || "No welcome message set."}
                                </p>
                              </div>

                              <div>
                                <h6 className="flex items-center gap-2 font-semibold text-gray-700 mb-1">
                                  <FileText size={14} /> System Prompt
                                </h6>
                                <p className="text-gray-600 bg-gray-50 p-2 rounded border border-gray-100 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                  {agent.prompt || "No prompt set."}
                                </p>
                              </div>

                              <div>
                                <h6 className="flex items-center gap-2 font-semibold text-gray-700 mb-2">
                                  <FileText size={14} /> Knowledge Files
                                </h6>
                                {agent.files.length > 0 ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {agent.files.map((file) => (
                                      <div
                                        key={file.id}
                                        className="flex items-center gap-2 p-2 rounded border border-gray-100 bg-gray-50"
                                      >
                                        <div className="w-8 h-8 rounded bg-red-50 flex items-center justify-center text-red-500 font-bold text-xs">
                                          PDF
                                        </div>
                                        <div className="overflow-hidden">
                                          <p className="text-xs font-medium text-gray-900 truncate">
                                            {file.originalName}
                                          </p>
                                          <p className="text-[10px] text-gray-500">
                                            {(file.size / 1024).toFixed(1)} KB •{" "}
                                            {new Date(
                                              file.uploadedAt
                                            ).toLocaleDateString()}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-gray-500 italic text-xs">
                                    No knowledge files uploaded.
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 italic text-sm">
                      No agents created by this user.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Admin Overview
          </h1>
          <p className="text-gray-500 mt-1">
            Welcome back, <span className="font-semibold">{user?.email}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button className="p-2 text-gray-400 hover:text-[#5c469c] transition-colors rounded-lg border border-gray-200">
            <Bell size={20} />
          </button>
          <button
            onClick={logout}
            className="bg-red-50 text-red-600 px-4 py-2 rounded-lg font-medium hover:bg-red-100 transition-colors flex items-center gap-2 shadow-sm border border-red-100"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>

      {view === "overview" ? renderOverview() : renderUsersList()}
    </div>
  );
};

export default AdminDashboard;
