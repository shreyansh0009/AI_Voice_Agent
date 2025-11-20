import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';

/**
 * Custom hook for making API calls with loading and error states
 * @param {string} url - API endpoint URL
 * @param {object} options - Axios options
 * @returns {object} { data, loading, error, refetch }
 */
export const useApi = (url, options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const optionsString = JSON.stringify(options);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Ensure hooks use the same API base as the rest of the app.
      const endpoint = url.startsWith('/api') ? url : `/api${url}`;
      const response = await api.request({ url: endpoint, ...JSON.parse(optionsString) });
      setData(response.data);
      return response.data;
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'An error occurred');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [url, optionsString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
};

/**
 * Custom hook for fetching agents
 * @returns {object} { agents, loading, error, refetch }
 */
export const useAgents = () => {
  const { data, loading, error, refetch } = useApi('/agent/list');

  return {
    agents: data?.agents || [],
    loading,
    error,
    refetch,
  };
};

/**
 * Custom hook for fetching call history
 * @param {object} filters - Filter options
 * @returns {object} { calls, loading, error, refetch }
 */
export const useCallHistory = (filters = {}) => {
  const params = new URLSearchParams();
  if (filters.direction && filters.direction !== 'all') {
    params.append('direction', filters.direction);
  }
  if (filters.status && filters.status !== 'all') {
    params.append('status', filters.status);
  }

  const queryString = params.toString();
  const url = queryString ? `/call/history?${queryString}` : '/call/history';

  const { data, loading, error, refetch } = useApi(url);

  return {
    calls: data?.calls || [],
    loading,
    error,
    refetch,
  };
};

/**
 * Custom hook for initiating calls
 * @returns {object} { initiateCall, loading, error }
 */
export const useInitiateCall = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const initiateCall = async (phoneNumber, agentId, customerContext = {}) => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.post(`/api/call/initiate`,
        {
          phoneNumber,
          agentId,
          customerContext,
        },
        { timeout: 10000 }
      );

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to initiate call');
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.error || err.message || 'Failed to initiate call';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return { initiateCall, loading, error };
};

/**
 * Custom hook for hanging up calls
 * @returns {object} { hangupCall, loading, error }
 */
export const useHangupCall = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hangupCall = async (callId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.post(`/api/call/${callId}/hangup`);

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to hang up call');
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.error || err.message || 'Failed to hang up call';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return { hangupCall, loading, error };
};

/**
 * Custom hook for creating/updating agents
 * @returns {object} { saveAgent, loading, error }
 */
export const useSaveAgent = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const saveAgent = async (agentData) => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = agentData.id
        ? `/agent/${agentData.id}`
        : '/agent/create';
      const method = agentData.id ? 'put' : 'post';

      const response = await api[method](`/api${endpoint}`, agentData);

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to save agent');
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.error || err.message || 'Failed to save agent';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return { saveAgent, loading, error };
};

/**
 * Custom hook for deleting agents
 * @returns {object} { deleteAgent, loading, error }
 */
export const useDeleteAgent = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const deleteAgent = async (agentId) => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.delete(`/api/agent/${agentId}`);

      if (response.data.success) {
        return response.data;
      } else {
        throw new Error(response.data.error || 'Failed to delete agent');
      }
    } catch (err) {
      const errorMsg =
        err.response?.data?.error || err.message || 'Failed to delete agent';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return { deleteAgent, loading, error };
};

/**
 * Custom hook for fetching call details
 * @param {string} callId - Call ID
 * @returns {object} { call, loading, error, refetch }
 */
export const useCallDetails = (callId) => {
  const { data, loading, error, refetch } = useApi(`/call/${callId}`);

  return {
    call: data?.call || null,
    loading,
    error,
    refetch,
  };
};

/**
 * Custom hook for polling call status
 * @param {string} callId - Call ID
 * @param {number} interval - Polling interval in milliseconds (default: 2000)
 * @returns {object} { call, loading, error, stopPolling }
 */
export const useCallStatusPolling = (callId, interval = 2000) => {
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPolling, setIsPolling] = useState(true);

  useEffect(() => {
    if (!callId || !isPolling) return;

    const pollStatus = async () => {
      try {
        const response = await api.get(`/api/call/${callId}`);
        if (response.data.success) {
          setCall(response.data.call);
          setError(null);

          // Stop polling if call is in final state
          if (['completed', 'failed', 'ended'].includes(response.data.call.status)) {
            setIsPolling(false);
          }
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    };

    // Initial poll
    pollStatus();

    // Set up interval
    const intervalId = setInterval(pollStatus, interval);

    return () => clearInterval(intervalId);
  }, [callId, interval, isPolling]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  return { call, loading, error, stopPolling };
};
