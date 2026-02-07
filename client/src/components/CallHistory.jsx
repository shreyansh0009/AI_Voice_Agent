import { useState, useEffect } from 'react';
import {
  RefreshCw,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Calendar,
  Phone,
  Clock,
  X,
  TrendingUp,
  DollarSign,
  Timer,
  CheckCircle,
  XCircle,
  PhoneOff,
  Activity
} from 'lucide-react';
import { VscGraph } from "react-icons/vsc";
import api from '../utils/api';
import { showSuccess, showError } from '../utils/toast';

const API_URL = '/api';

// Animation keyframes as inline styles for components
const pulseAnimation = {
  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
};

const fadeInAnimation = {
  animation: 'fadeIn 0.5s ease-out forwards'
};

const slideUpAnimation = {
  animation: 'slideUp 0.3s ease-out forwards'
};

export default function CallHistory() {
  const [calls, setCalls] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredRow, setHoveredRow] = useState(null);

  // Filters
  const [selectedAgent, setSelectedAgent] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [groupBy, setGroupBy] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [callTypeFilter, setCallTypeFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');

  // Performance metrics
  const [metrics, setMetrics] = useState({
    totalExecutions: 0,
    totalCost: 0,
    totalDuration: 0,
    avgCost: 0,
    avgDuration: 0,
    statusBreakdown: {
      completed: 0,
      noAnswer: 0,
      failed: 0,
      busy: 0
    }
  });

  // Modal states
  const [rawDataModal, setRawDataModal] = useState({ isOpen: false, data: null });
  const [conversationModal, setConversationModal] = useState({ isOpen: false, call: null });

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [selectedAgent, dateRange, statusFilter, callTypeFilter, providerFilter]);

  const fetchAgents = async () => {
    try {
      const response = await api.get(`${API_URL}/agents`);
      setAgents(response.data || []);
    } catch (err) {
      console.error('Error fetching agents:', err);
    }
  };

  const fetchCalls = async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams();
      if (selectedAgent) params.append('agentId', selectedAgent);
      if (dateRange.start) params.append('startDate', dateRange.start);
      if (dateRange.end) params.append('endDate', dateRange.end);
      if (statusFilter) params.append('status', statusFilter);
      if (callTypeFilter) params.append('callType', callTypeFilter);
      if (providerFilter) params.append('provider', providerFilter);

      const response = await api.get(`${API_URL}/call/history?${params.toString()}`);

      if (response.data.success) {
        const callsData = response.data.calls || [];
        setCalls(callsData);
        calculateMetrics(callsData);
      } else {
        throw new Error(response.data.error || 'Failed to fetch calls');
      }
    } catch (err) {
      console.error('Error fetching calls:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to fetch call history';
      setError(errorMsg);
      showError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const calculateMetrics = (callsData) => {
    const totalExecutions = callsData.length;
    const totalCost = callsData.reduce((sum, call) => sum + (call.cost || 0), 0);
    const totalDuration = callsData.reduce((sum, call) => sum + (call.duration || 0), 0);
    const avgCost = totalExecutions > 0 ? totalCost / totalExecutions : 0;
    const avgDuration = totalExecutions > 0 ? totalDuration / totalExecutions : 0;

    const statusBreakdown = {
      completed: callsData.filter(c => c.status === 'completed').length,
      noAnswer: callsData.filter(c => c.status === 'no-answer').length,
      failed: callsData.filter(c => c.status === 'failed').length,
      busy: callsData.filter(c => c.status === 'busy').length
    };

    setMetrics({
      totalExecutions,
      totalCost,
      totalDuration,
      avgCost,
      avgDuration,
      statusBreakdown
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatCost = (cost) => {
    return `₹${(cost || 0).toFixed(2)}`;
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const offset = diffHours > 0 ? `(-${diffHours}:${Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0')})` : '';

    return `${dateStr}, ${timeStr} ${offset}`;
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard');
  };

  const stopQueuedCalls = () => {
    showSuccess('Queued calls stopped');
  };

  const downloadRecords = () => {
    showSuccess('Downloading records...');
  };

  const filteredCalls = calls.filter((call) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return call.executionId?.toLowerCase().includes(query) ||
        call.userNumber?.toLowerCase().includes(query);
    }
    return true;
  });

  // Metric card component with gradient and animation
  const MetricCard = ({ title, value, subtitle, icon: Icon, gradient, delay = 0 }) => (
    <div
      className={`relative overflow-hidden rounded-xl p-5 shadow-lg transform transition-all duration-300 hover:scale-105 hover:shadow-xl cursor-pointer group`}
      style={{
        background: gradient,
        animationDelay: `${delay}ms`,
        ...fadeInAnimation
      }}
    >
      {/* Animated background circles */}
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/10 rounded-full transform group-hover:scale-110 transition-transform duration-500" />
      <div className="absolute -right-2 -bottom-2 w-16 h-16 bg-white/5 rounded-full transform group-hover:scale-125 transition-transform duration-700" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-white/90">{title}</span>
          {Icon && <Icon className="w-5 h-5 text-white/80 group-hover:rotate-12 transition-transform duration-300" />}
        </div>
        <div className="text-3xl font-bold text-white mb-1 group-hover:tracking-wide transition-all duration-300">{value}</div>
        <div className="text-xs text-white/70">{subtitle}</div>
      </div>
    </div>
  );

  // Status badge with animation
  const StatusBadge = ({ status }) => {
    const statusConfig = {
      completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle },
      'no-answer': { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', icon: PhoneOff },
      failed: { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', icon: XCircle },
      busy: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', icon: Activity }
    };

    const config = statusConfig[status] || statusConfig.completed;
    const StatusIcon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border ${config.bg} ${config.text} ${config.border} transition-all duration-300 hover:shadow-md`}>
        <StatusIcon className="w-3.5 h-3.5" />
        {status || 'Completed'}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-bg {
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
      `}</style>

      <div className="max-w-[1400px] mx-auto">
        {/* Header with Filters */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-5 mb-6 transition-all duration-300 hover:shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {/* Agent Selector */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Agent:</span>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="px-4 py-2.5 text-sm border-2 border-indigo-100 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 transition-all duration-300 bg-white/80 hover:border-indigo-300"
                >
                  <option value="">All Agents</option>
                  {agents.map((agent) => (
                    <option key={agent._id} value={agent._id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Range Picker */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-2 border-purple-100 rounded-xl bg-white/80 hover:border-purple-300 transition-all duration-300 group">
                <Calendar className="w-4 h-4 text-purple-500 group-hover:rotate-12 transition-transform duration-300" />
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="text-sm border-none focus:ring-0 focus:outline-none bg-transparent"
                />
                <span className="text-purple-400 font-bold">→</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="text-sm border-none focus:ring-0 focus:outline-none bg-transparent"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={fetchCalls}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-indigo-500 to-purple-500 rounded-xl hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={stopQueuedCalls}
                className="px-5 py-2.5 text-sm font-medium text-rose-600 border-2 border-rose-200 rounded-xl hover:bg-rose-50 hover:border-rose-300 transition-all duration-300 transform hover:scale-105"
              >
                Stop Queued
              </button>
              <button
                onClick={downloadRecords}
                className="px-5 py-2.5 text-sm font-medium text-emerald-600 border-2 border-emerald-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 transition-all duration-300 transform hover:scale-105"
              >
                Download
              </button>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                <VscGraph className="text-xl text-white" />
              </div>
              <span className="bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                Performance Metrics
              </span>
            </h2>
            <div className="flex items-center gap-3">
              {['Group by', 'Status', 'Call type', 'Provider'].map((filter, idx) => (
                <button
                  key={filter}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-indigo-600 bg-white/80 border-2 border-gray-100 rounded-xl hover:border-indigo-200 hover:bg-indigo-50 transition-all duration-300 transform hover:scale-105"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  {filter}
                  <ChevronDown className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-5 mb-5">
            <MetricCard
              title="Total Executions"
              value={metrics.totalExecutions}
              subtitle="All call attempts"
              icon={Phone}
              gradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
              delay={0}
            />
            <MetricCard
              title="Total Cost"
              value={formatCost(metrics.totalCost)}
              subtitle="Total campaign spend"
              icon={DollarSign}
              gradient="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)"
              delay={100}
            />
            <MetricCard
              title="Total Duration"
              value={formatDuration(metrics.totalDuration)}
              subtitle="Total call time"
              icon={Timer}
              gradient="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)"
              delay={200}
            />
            <MetricCard
              title="Avg Cost"
              value={formatCost(metrics.avgCost)}
              subtitle="Per call average"
              icon={TrendingUp}
              gradient="linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)"
              delay={300}
            />
            <MetricCard
              title="Avg Duration"
              value={formatDuration(metrics.avgDuration)}
              subtitle="Average call length"
              icon={Clock}
              gradient="linear-gradient(135deg, #fa709a 0%, #fee140 100%)"
              delay={400}
            />
          </div>

          {/* Status Breakdown Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border-2 border-emerald-100 hover:border-emerald-300 transition-all duration-300 transform hover:scale-102 hover:shadow-lg group">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg group-hover:bg-emerald-200 transition-colors duration-300">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-emerald-600">{metrics.statusBreakdown.completed}</div>
                  <div className="text-sm text-gray-500">Completed</div>
                </div>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border-2 border-amber-100 hover:border-amber-300 transition-all duration-300 transform hover:scale-102 hover:shadow-lg group">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors duration-300">
                  <PhoneOff className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-600">{metrics.statusBreakdown.noAnswer}</div>
                  <div className="text-sm text-gray-500">No Answer</div>
                </div>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border-2 border-rose-100 hover:border-rose-300 transition-all duration-300 transform hover:scale-102 hover:shadow-lg group">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 rounded-lg group-hover:bg-rose-200 transition-colors duration-300">
                  <XCircle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-rose-600">{metrics.statusBreakdown.failed}</div>
                  <div className="text-sm text-gray-500">Failed</div>
                </div>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border-2 border-orange-100 hover:border-orange-300 transition-all duration-300 transform hover:scale-102 hover:shadow-lg group">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg group-hover:bg-orange-200 transition-colors duration-300">
                  <Activity className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-600">{metrics.statusBreakdown.busy}</div>
                  <div className="text-sm text-gray-500">Busy</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Calls Table */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 overflow-hidden">
          {/* Search Bar */}
          <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-indigo-50/50">
            <div className="relative max-w-md">
              <input
                type="text"
                placeholder="🔍 Search by execution id or phone number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-5 py-3 text-sm border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 transition-all duration-300 bg-white/90 hover:border-indigo-200"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-indigo-50/50 border-b border-gray-200">
                <tr>
                  {['Execution ID', 'User Number', 'Type', 'Duration', 'Hangup By', 'Batch', 'Timestamp', 'Cost', 'Status', 'Data', 'Trace', 'Raw'].map((header, idx) => (
                    <th key={header} className="px-4 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && filteredCalls.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg animate-pulse">
                          <RefreshCw className="w-8 h-8 text-white animate-spin" />
                        </div>
                        <span className="text-gray-500 font-medium">Loading calls...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredCalls.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="px-4 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-4 bg-gray-100 rounded-2xl">
                          <Phone className="w-8 h-8 text-gray-400" />
                        </div>
                        <span className="text-gray-500 font-medium">No calls found</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCalls.map((call, index) => (
                    <tr
                      key={call.executionId || call._id}
                      className={`transition-all duration-300 cursor-pointer ${hoveredRow === index
                        ? 'bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 shadow-sm scale-[1.01]'
                        : 'hover:bg-gray-50'
                        }`}
                      onMouseEnter={() => setHoveredRow(index)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        animationDelay: `${index * 30}ms`,
                        ...slideUpAnimation
                      }}
                    >
                      <td className="px-4 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-gray-800 bg-indigo-100 px-2 py-1 rounded-lg">{call.executionId?.substring(0, 6)}...</span>
                          <button
                            onClick={() => copyToClipboard(call.executionId)}
                            className="text-gray-400 hover:text-indigo-600 transition-colors duration-200 transform hover:scale-110"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-800">{call.userNumber || '-'}</td>
                      <td className="px-4 py-4 text-sm">
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium">
                          {call.conversationType || 'plivo inbound'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className="font-semibold text-gray-800">{call.duration || 0}s</span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">{call.hangupBy || 'Plivo'}</td>
                      <td className="px-4 py-4 text-sm text-gray-600">{call.batch || '-'}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        <div className="whitespace-nowrap">{formatTimestamp(call.timestamp || call.createdAt)}</div>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <span className="font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                          {formatCost(call.cost)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <StatusBadge status={call.status} />
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <button
                          onClick={() => setConversationModal({ isOpen: true, call: call })}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-all duration-200 transform hover:scale-105"
                        >
                          <span>View</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <button className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all duration-200 transform hover:scale-110">
                          <FileText className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <button
                          onClick={() => setRawDataModal({ isOpen: true, data: call.rawData })}
                          className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all duration-200 transform hover:scale-110"
                          title="View Raw Data"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Raw Data Modal */}
      {rawDataModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setRawDataModal({ isOpen: false, data: null })}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col transform transition-all duration-300 scale-100"
            onClick={(e) => e.stopPropagation()}
            style={slideUpAnimation}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-indigo-50 rounded-t-2xl">
              <h3 className="text-lg font-bold bg-gradient-to-r from-gray-800 to-indigo-600 bg-clip-text text-transparent">Raw Call Data</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(rawDataModal.data, null, 2));
                    showSuccess('Copied to clipboard');
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl hover:from-indigo-600 hover:to-purple-600 transition-all duration-300 transform hover:scale-105 shadow-lg"
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </button>
                <button
                  onClick={() => setRawDataModal({ isOpen: false, data: null })}
                  className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition-all duration-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto p-5">
              {rawDataModal.data ? (
                <pre className="bg-gradient-to-br from-gray-900 to-indigo-900 text-emerald-400 p-5 rounded-xl text-sm font-mono whitespace-pre-wrap overflow-x-auto shadow-inner">
                  {JSON.stringify(rawDataModal.data, null, 2)}
                </pre>
              ) : (
                <div className="text-center text-gray-500 py-12">
                  <div className="p-4 bg-gray-100 rounded-2xl inline-block mb-4">
                    <FileText className="w-12 h-12 text-gray-400" />
                  </div>
                  <p className="font-medium">No raw data available for this call</p>
                  <p className="text-sm mt-2 text-gray-400">Raw data is captured for new calls only</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Conversation Data Modal */}
      {conversationModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setConversationModal({ isOpen: false, call: null })}>
          <div
            className="bg-gradient-to-br from-gray-50 to-indigo-50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
            style={slideUpAnimation}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-white rounded-t-2xl border-b border-gray-100 shadow-sm">
              <h3 className="text-lg font-bold bg-gradient-to-r from-gray-800 to-purple-600 bg-clip-text text-transparent">Conversation Data</h3>
              <button
                onClick={() => setConversationModal({ isOpen: false, call: null })}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="flex-1 overflow-auto p-5 space-y-5">
              {/* Recording Section */}
              <div className="bg-white rounded-xl border-2 border-indigo-100 p-5 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-gray-800 flex items-center gap-2">
                    <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg">
                      <Activity className="w-4 h-4 text-white" />
                    </div>
                    Recording
                  </h4>
                  {conversationModal.call?.recordingUrl && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(conversationModal.call.recordingUrl);
                          showSuccess('Recording URL copied');
                        }}
                        className="p-2 hover:bg-indigo-50 rounded-lg text-gray-400 hover:text-indigo-600 transition-all duration-200"
                        title="Copy URL"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <a
                        href={conversationModal.call.recordingUrl}
                        download
                        className="p-2 hover:bg-emerald-50 rounded-lg text-gray-400 hover:text-emerald-600 transition-all duration-200"
                        title="Download"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                </div>
                {conversationModal.call?.recordingUrl ? (
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4">
                    <audio
                      controls
                      className="w-full"
                      src={conversationModal.call.recordingUrl}
                    >
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                ) : (
                  <div className="bg-gray-100 rounded-xl p-6 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <div className="w-full h-12 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 rounded-lg opacity-50 mb-3 shimmer-bg" />
                      <p className="text-sm">Recording not available for this call</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Transcript Section */}
              <div className="bg-white rounded-xl border-2 border-purple-100 p-5 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-gray-800 flex items-center gap-2">
                    <div className="p-1.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    Transcript
                  </h4>
                  <button
                    onClick={() => {
                      const transcript = conversationModal.call?.transcript
                        ?.map(t => `${t.role}: ${t.content}`)
                        .join('\n') || '';
                      navigator.clipboard.writeText(transcript);
                      showSuccess('Transcript copied');
                    }}
                    className="p-2 hover:bg-purple-50 rounded-lg text-gray-400 hover:text-purple-600 transition-all duration-200"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                  {conversationModal.call?.transcript?.length > 0 ? (
                    conversationModal.call.transcript.map((entry, index) => (
                      <div
                        key={index}
                        className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        style={{ animationDelay: `${index * 50}ms`, ...fadeInAnimation }}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl p-3.5 shadow-sm transition-all duration-300 hover:shadow-md ${entry.role === 'user'
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white'
                            : 'bg-white border-2 border-purple-100 text-gray-800'
                            }`}
                        >
                          <div className={`text-xs font-semibold mb-1 ${entry.role === 'user' ? 'text-right text-indigo-100' : 'text-purple-600'}`}>
                            {entry.role === 'user' ? 'User' : 'Assistant'}
                          </div>
                          <p className="text-sm leading-relaxed">{entry.content}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-center py-6">No transcript available</p>
                  )}
                </div>
              </div>

              {/* Summary Section */}
              <div className="bg-white rounded-xl border-2 border-emerald-100 p-5 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <div className="p-1.5 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-white" />
                  </div>
                  Summary
                </h4>
                <p className="text-sm text-gray-700 leading-relaxed bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-xl">
                  {conversationModal.call?.rawData?.summary ||
                    `Call with ${conversationModal.call?.userNumber || 'unknown'} lasted ${formatDuration(conversationModal.call?.duration || 0)}. 
                   ${conversationModal.call?.transcript?.length || 0} messages exchanged. 
                   Status: ${conversationModal.call?.status || 'completed'}.`}
                </p>
              </div>

              {/* Extracted Data Section */}
              <div className="bg-white rounded-xl border-2 border-amber-100 p-5 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg">
                    <DollarSign className="w-4 h-4 text-white" />
                  </div>
                  Extracted Data
                </h4>
                {conversationModal.call?.customerContext && Object.keys(conversationModal.call.customerContext).length > 0 ? (
                  <pre className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 rounded-xl text-sm font-mono text-gray-800 overflow-x-auto border border-amber-100">
                    {JSON.stringify(conversationModal.call.customerContext, null, 2)}
                  </pre>
                ) : (
                  <p className="text-gray-500 text-sm bg-gray-50 p-4 rounded-xl text-center">No data extracted from this call</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
