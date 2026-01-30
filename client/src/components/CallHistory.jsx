import { useState, useEffect } from 'react';
import {
  RefreshCw,
  ChevronDown,
  Copy,
  ExternalLink,
  FileText,
  Calendar,
  Phone,
  Clock
} from 'lucide-react';
import { VscGraph } from "react-icons/vsc";
import api from '../utils/api';
import { showSuccess, showError } from '../utils/toast';

const API_URL = '/api';

export default function CallHistory() {
  const [calls, setCalls] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Filters
  const [selectedAgent, setSelectedAgent] = useState('');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [groupBy, setGroupBy] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [callTypeFilter, setCallTypeFilter] = useState('');
  const [providerFilter, setProviderFilter] = useState('');

  // Performance metrics (calculated from calls data)
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

  // Fetch agents on mount
  useEffect(() => {
    fetchAgents();
  }, []);

  // Fetch calls when filters change
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

      // Build query params
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-[1400px] mx-auto">
        {/* Header with Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {/* Agent Selector */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Agent:</span>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
              <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg">
                <Calendar className="w-4 h-4 text-gray-500" />
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="text-sm border-none focus:ring-0 focus:outline-none"
                />
                <span className="text-gray-500">-</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="text-sm border-none focus:ring-0 focus:outline-none"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={fetchCalls}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={stopQueuedCalls}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Stop Queued Calls
              </button>
              <button
                onClick={downloadRecords}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Download Records
              </button>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <VscGraph className="text-xl" />
              Performance Metrics
            </h2>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setGroupBy(groupBy === 'group' ? '' : 'group')}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg"
              >
                Group by
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === 'status' ? '' : 'status')}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg"
              >
                Status
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCallTypeFilter(callTypeFilter === 'type' ? '' : 'type')}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg"
              >
                Call type
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => setProviderFilter(providerFilter === 'provider' ? '' : 'provider')}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg"
              >
                Provider
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
            {/* Total Executions */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Total Executions</span>
                <Phone className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-3xl font-semibold text-gray-900">{metrics.totalExecutions}</div>
              <div className="text-xs text-gray-500 mt-1">All call attempts</div>
            </div>

            {/* Total Cost */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Total Cost</span>
              </div>
              <div className="text-3xl font-semibold text-gray-900">{formatCost(metrics.totalCost)}</div>
              <div className="text-xs text-gray-500 mt-1">Total campaign spend</div>
            </div>

            {/* Total Duration */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Total Duration</span>
                <Clock className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-3xl font-semibold text-gray-900">{formatDuration(metrics.totalDuration)}</div>
              <div className="text-xs text-gray-500 mt-1">Total call time</div>
            </div>

            {/* Status Breakdown */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Status Breakdown</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm border border-gray-300 rounded-lg p-2">
                  <span className="text-gray-600 font-semibold">Completed</span>
                  <span className="font-medium text-gray-900">{metrics.statusBreakdown.completed}</span>
                </div>
                <div className="flex items-center justify-between text-sm border border-gray-300 rounded-lg p-2">
                  <span className="text-gray-600 font-semibold">No-Answer</span>
                  <span className="font-medium text-gray-900">{metrics.statusBreakdown.noAnswer}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Second Row Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Avg Cost */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Avg Cost</span>
              </div>
              <div className="text-3xl font-semibold text-gray-900">{formatCost(metrics.avgCost)}</div>
              <div className="text-xs text-gray-500 mt-1">Average cost per call</div>
            </div>

            {/* Avg Duration */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Avg Duration</span>
                <Clock className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-3xl font-semibold text-gray-900">{formatDuration(metrics.avgDuration)}</div>
              <div className="text-xs text-gray-500 mt-1">Average call length</div>
            </div>
          </div>
        </div>

        {/* Calls Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {/* Search Bar */}
          <div className="p-4 border-b border-gray-200">
            <input
              type="text"
              placeholder="Search by execution id"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Execution ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    User Number
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Conversation Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Duration (s)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Hangup By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Batch
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Cost
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Conversation Data
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Trace Data
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 tracking-wider">
                    Raw Data
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading && filteredCalls.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="px-4 py-8 text-center text-gray-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                      Loading calls...
                    </td>
                  </tr>
                ) : filteredCalls.length === 0 ? (
                  <tr>
                    <td colSpan="12" className="px-4 py-8 text-center text-gray-500">
                      No calls found
                    </td>
                  </tr>
                ) : (
                  filteredCalls.map((call) => (
                    <tr key={call.executionId || call._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-900">{call.executionId?.substring(0, 6)}...</span>
                          <button
                            onClick={() => copyToClipboard(call.executionId)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{call.userNumber || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{call.conversationType || 'plivo inbound'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{call.duration || 0}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{call.hangupBy || 'Plivo'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{call.batch || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="whitespace-nowrap">{formatTimestamp(call.timestamp || call.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{formatCost(call.cost)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${call.status === 'completed' ? 'bg-green-100 text-green-800' :
                          call.status === 'no-answer' ? 'bg-yellow-100 text-yellow-800' :
                            call.status === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                          }`}>
                          {call.status || 'Completed'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                          <span className="text-xs">Recordings, transcripts, etc</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button className="text-gray-400 hover:text-gray-600">
                          <FileText className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button className="text-gray-400 hover:text-gray-600">
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
    </div>
  );
}
