import { useState, useEffect } from 'react';
import { Phone, PhoneOff, Loader2 } from 'lucide-react';
import axios from 'axios';
import { showSuccess, showError } from '../utils/toast';

const API_URL = 'http://localhost:5000/api';

export default function CallDialer({ agents = [] }) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('');
  const [callState, setCallState] = useState('idle'); // idle, calling, active, ended
  const [activeCall, setActiveCall] = useState(null);
  const [error, setError] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [isValidNumber, setIsValidNumber] = useState(false);

  // Timer for call duration
  useEffect(() => {
    let interval;
    if (callState === 'active') {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const formatPhoneNumber = (value) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, '');
    
    // Format: +91 XXXXX XXXXX
    if (digits.startsWith('91')) {
      const rest = digits.slice(2);
      if (rest.length <= 5) return `+91 ${rest}`;
      return `+91 ${rest.slice(0, 5)} ${rest.slice(5, 10)}`;
    }
    
    return digits.length > 0 ? `+${digits}` : '';
  };

  const handlePhoneNumberChange = (e) => {
    const formatted = formatPhoneNumber(e.target.value);
    setPhoneNumber(formatted);
    setIsValidNumber(validatePhoneNumber(formatted));
    setError(''); // Clear error on input
  };

  // Handle Enter key press
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && callState === 'idle' && phoneNumber && selectedAgent) {
      initiateCall();
    }
  };

  const validatePhoneNumber = (number) => {
    // Remove spaces and +
    const digits = number.replace(/[\s+]/g, '');
    
    // Check if it's a valid Indian number
    if (digits.startsWith('91') && digits.length === 12) {
      return true;
    }
    
    // Check if it's any valid international number (10-15 digits)
    if (digits.length >= 10 && digits.length <= 15) {
      return true;
    }
    
    return false;
  };

  const initiateCall = async (isRetry = false) => {
    try {
      setError('');
      
      // Validation
      if (!phoneNumber) {
        showError('Please enter a phone number');
        return;
      }
      
      if (!validatePhoneNumber(phoneNumber)) {
        showError('Please enter a valid phone number (e.g., +91 98765 43210)');
        return;
      }
      
      if (!selectedAgent) {
        showError('Please select an agent');
        return;
      }

      setCallState('calling');

      // Format phone number for API (remove spaces)
      const formattedNumber = phoneNumber.replace(/\s/g, '');

      const response = await axios.post(`${API_URL}/call/initiate`, {
        phoneNumber: formattedNumber,
        agentId: selectedAgent,
        customerContext: {}
      }, {
        timeout: 10000 // 10 second timeout
      });

      if (response.data.success) {
        setActiveCall({
          callId: response.data.callId,
          exotelCallSid: response.data.exotelCallSid,
          phoneNumber: formattedNumber,
          agentId: selectedAgent
        });
        setCallState('active');
        showSuccess('Call connected successfully!');
      } else {
        throw new Error(response.data.error || 'Failed to initiate call');
      }
    } catch (err) {
      console.error('Error initiating call:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to initiate call';
      showError(errorMsg + (isRetry ? '' : ' - Click "Retry" to try again'));
      setCallState('idle');
    }
  };

  const hangupCall = async () => {
    try {
      if (activeCall?.callId) {
        await axios.post(`${API_URL}/call/${activeCall.callId}/hangup`);
      }
      setCallState('ended');
      showSuccess('Call ended');
      setTimeout(() => {
        setCallState('idle');
        setActiveCall(null);
        setPhoneNumber('');
      }, 2000);
    } catch (err) {
      console.error('Error hanging up call:', err);
      showError('Failed to hang up call');
      // Still reset the UI
      setCallState('idle');
      setActiveCall(null);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Phone className="w-5 h-5" />
        Make a Call
      </h2>

      {/* Call Status Display */}
      {callState !== 'idle' && (
        <div className={`mb-4 p-4 rounded-lg ${
          callState === 'calling' ? 'bg-yellow-50 border border-yellow-200' :
          callState === 'active' ? 'bg-green-50 border border-green-200' :
          'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {callState === 'calling' && '📞 Calling...'}
                {callState === 'active' && '✓ Call Active'}
                {callState === 'ended' && '✓ Call Ended'}
              </p>
              <p className="text-sm text-gray-600">{phoneNumber}</p>
            </div>
            {callState === 'active' && (
              <div className="text-2xl font-mono">{formatDuration(callDuration)}</div>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
          {error.includes('Retry') && (
            <button
              onClick={() => initiateCall(true)}
              className="mt-2 px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
            >
              Retry Call
            </button>
          )}
        </div>
      )}

      {/* Dialer Form */}
      {callState === 'idle' && (
        <div className="space-y-4">
          {/* Phone Number Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={handlePhoneNumberChange}
              onKeyPress={handleKeyPress}
              placeholder="+91 98765 43210"
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                phoneNumber && isValidNumber ? 'border-green-300 bg-green-50' : 
                phoneNumber && !isValidNumber ? 'border-red-300 bg-red-50' : 
                'border-gray-300'
              }`}
              disabled={callState !== 'idle'}
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter phone number with country code (e.g., +91 for India)
            </p>
          </div>

          {/* Agent Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Agent
            </label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={callState !== 'idle'}
            >
              <option value="">Choose an agent...</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            {agents.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ No agents available. Create an agent first.
              </p>
            )}
          </div>

          {/* Call Button */}
          <button
            onClick={initiateCall}
            disabled={callState !== 'idle'}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <Phone className="w-5 h-5" />
            Call Now
          </button>
        </div>
      )}

      {/* Active Call Controls */}
      {(callState === 'calling' || callState === 'active') && (
        <div className="space-y-3">
          {callState === 'calling' && (
            <div className="flex items-center justify-center gap-2 text-gray-600 py-4">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Connecting call...</span>
            </div>
          )}

          <button
            onClick={hangupCall}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            <PhoneOff className="w-5 h-5" />
            End Call
          </button>

          {/* Call Info */}
          {activeCall && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
              <p className="text-gray-600">Call ID: <span className="font-mono text-xs">{activeCall.callId}</span></p>
              {activeCall.exotelCallSid && (
                <p className="text-gray-600">Exotel SID: <span className="font-mono text-xs">{activeCall.exotelCallSid}</span></p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-2">How it works:</h3>
        <ul className="text-xs text-gray-600 space-y-1">
          <li>• Enter the phone number you want to call</li>
          <li>• Select an AI agent to handle the conversation</li>
          <li>• Click "Call Now" to initiate the call</li>
          <li>• The AI agent will speak and respond to the customer</li>
          <li>• View call history and transcripts after the call ends</li>
        </ul>
      </div>
    </div>
  );
}
