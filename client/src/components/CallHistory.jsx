import { useState } from 'react';
import { 
  Phone, 
  PhoneIncoming, 
  PhoneOutgoing, 
  Clock, 
  MessageSquare,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Filter
} from 'lucide-react';
import axios from 'axios';
import { showSuccess, showError } from '../utils/toast';

const API_URL = `${import.meta.env.VITE_API_URL}/api`;

export default function CallHistory() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCall, setExpandedCall] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    direction: 'all', // all, inbound, outbound
    status: 'all', // all, completed, failed, in_progress
  });

  const fetchCalls = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Build query params
      const params = new URLSearchParams();
      if (filters.direction !== 'all') params.append('direction', filters.direction);
      if (filters.status !== 'all') params.append('status', filters.status);
      
      const response = await axios.get(`${API_URL}/call/history?${params.toString()}`);
      
      if (response.data.success) {
        setCalls(response.data.calls || []);
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

  const fetchCallTranscript = async (callId) => {
    try {
      const response = await axios.get(`${API_URL}/call/${callId}`);
      if (response.data.success) {
        return response.data.call;
      }
    } catch (err) {
      console.error('Error fetching call details:', err);
      showError('Failed to load call details');
    }
    return null;
  };

  const toggleCallExpanded = async (callId) => {
    if (expandedCall === callId) {
      setExpandedCall(null);
    } else {
      setExpandedCall(callId);
      
      // Fetch full call details if not already loaded
      const call = calls.find(c => c.id === callId);
      if (call && !call.transcript) {
        const fullCall = await fetchCallTranscript(callId);
        if (fullCall) {
          setCalls(calls.map(c => c.id === callId ? fullCall : c));
        }
      }
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPhoneNumber = (number) => {
    // Format +919876543210 to +91 98765 43210
    if (number.startsWith('+91')) {
      const rest = number.slice(3);
      if (rest.length === 10) {
        return `+91 ${rest.slice(0, 5)} ${rest.slice(5)}`;
      }
    }
    return number;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    
    return date.toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'in_progress': return 'text-blue-600 bg-blue-50';
      case 'failed': return 'text-red-600 bg-red-50';
      case 'initiated': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const exportTranscript = (call) => {
    try {
      const transcript = call.transcript || [];
      const text = transcript.map(msg => {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        return `[${time}] ${msg.type.toUpperCase()}: ${msg.content}`;
      }).join('\n');
      
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `call-transcript-${call.id}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess('Transcript exported successfully');
    } catch (err) {
      console.error('Error exporting transcript:', err);
      showError('Failed to export transcript');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Call History
          </h2>
          <button
            onClick={fetchCalls}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Search Bar */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search by phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={filters.direction}
              onChange={(e) => setFilters({ ...filters, direction: e.target.value })}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Calls</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
            </select>
          </div>
          
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In Progress</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && calls.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty State */}
      {!loading && calls.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500">
          <Phone className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-lg font-medium">No calls yet</p>
          <p className="text-sm">Make your first call to see it here</p>
        </div>
      )}

      {/* Calls List */}
      <div className="divide-y divide-gray-200">
        {calls
          .filter((call) => {
            // Search filter
            if (searchQuery) {
              const query = searchQuery.toLowerCase();
              const phoneMatch = call.phone_number?.toLowerCase().includes(query);
              const idMatch = call.id?.toString().includes(query);
              if (!phoneMatch && !idMatch) return false;
            }
            return true;
          })
          .map((call) => (
          <div key={call.id} className="p-4 hover:bg-gray-50 transition-colors">
            {/* Call Summary */}
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleCallExpanded(call.id)}
            >
              <div className="flex items-center gap-3 flex-1">
                {/* Direction Icon */}
                <div className={`p-2 rounded-full ${
                  call.direction === 'inbound' ? 'bg-blue-100' : 'bg-green-100'
                }`}>
                  {call.direction === 'inbound' ? (
                    <PhoneIncoming className="w-4 h-4 text-blue-600" />
                  ) : (
                    <PhoneOutgoing className="w-4 h-4 text-green-600" />
                  )}
                </div>

                {/* Call Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{formatPhoneNumber(call.phoneNumber)}</p>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(call.status)}`}>
                      {call.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(call.createdAt)}
                    </span>
                    {call.duration > 0 && (
                      <span>Duration: {formatDuration(call.duration)}</span>
                    )}
                    {call.transcript && call.transcript.length > 0 && (
                      <span>{call.transcript.length} messages</span>
                    )}
                  </div>
                </div>

                {/* Expand Icon */}
                {expandedCall === call.id ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </div>

            {/* Expanded Transcript */}
            {expandedCall === call.id && (
              <div className="mt-4 pl-11">
                {call.transcript && call.transcript.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-700">Transcript</h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportTranscript(call);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Download className="w-3 h-3" />
                        Export
                      </button>
                    </div>
                    
                    <div className="space-y-2 max-h-96 overflow-y-auto bg-gray-50 rounded-lg p-3">
                      {call.transcript.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`p-2 rounded ${
                            msg.type === 'user' ? 'bg-blue-100 ml-4' :
                            msg.type === 'assistant' ? 'bg-green-100 mr-4' :
                            'bg-gray-200 text-gray-600 text-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium capitalize">{msg.type}</span>
                            <span className="text-xs text-gray-600">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-sm">{msg.content}</p>
                          {msg.audioUrl && (
                            <a
                              href={msg.audioUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                            >
                              🎵 Listen to recording
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500 italic">No transcript available</p>
                )}

                {/* Customer Context */}
                {call.customerContext && Object.keys(call.customerContext).length > 0 && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Customer Info</h4>
                    <div className="text-sm text-gray-600 space-y-1">
                      {call.customerContext.name && (
                        <p><strong>Name:</strong> {call.customerContext.name}</p>
                      )}
                      {call.customerContext.email && (
                        <p><strong>Email:</strong> {call.customerContext.email}</p>
                      )}
                      {call.customerContext.phone && (
                        <p><strong>Phone:</strong> {call.customerContext.phone}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Call Metadata */}
                <div className="mt-3 p-2 bg-gray-100 rounded text-xs text-gray-600 font-mono">
                  <p>Call ID: {call.id}</p>
                  {call.exotelCallSid && <p>Exotel SID: {call.exotelCallSid}</p>}
                  {call.agentId && <p>Agent: {call.agentId}</p>}
                </div>
              </div>
            )}
          </div>
        ))
        }
      </div>
    </div>
  );
}
