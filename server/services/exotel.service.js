import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Exotel Service - Handles phone call operations via Exotel API
 * Docs: https://developer.exotel.com/api/
 */
class ExotelService {
  constructor() {
    this.sid = process.env.EXOTEL_SID;
    this.token = process.env.EXOTEL_TOKEN;
    this.phoneNumber = process.env.EXOTEL_PHONE_NUMBER; // Your Exotel virtual number
    this.subDomain = process.env.EXOTEL_SUBDOMAIN || 'api'; // api or api.exotel.in
    // Build base URL safely. Allow providing full base URL via EXOTEL_BASE_URL
    const envBase = process.env.EXOTEL_BASE_URL;
    if (envBase) {
      // If user provided a full base URL use it (strip trailing slash)
      this.baseUrl = envBase.replace(/\/+$/, '');
    } else if (this.subDomain.includes('exotel')) {
      // If subDomain already contains the domain (e.g. api.exotel.com or api.exotel.in), use as-is
      // Ensure it has a protocol
      const host = this.subDomain.startsWith('http') ? this.subDomain : `https://${this.subDomain}`;
      this.baseUrl = `${host.replace(/\/+$/, '')}/v1/Accounts/${this.sid}`;
    } else {
      // Default behaviour: append .exotel.com to the subdomain
      this.baseUrl = `https://${this.subDomain}.exotel.com/v1/Accounts/${this.sid}`;
    }
    
  // Support using API key username/token (preferred) or fallback to SID/token
  this.apiKeyUser = process.env.EXOTEL_API_KEY || process.env.EXOTEL_API_KEY_USERNAME || null;
  this.apiToken = process.env.EXOTEL_API_TOKEN || process.env.EXOTEL_API_TOKEN_PASSWORD || null;

  // Choose auth credentials: prefer API key username/token, otherwise fall back to SID/token
  this.authUser = this.apiKeyUser || this.sid;
  this.authToken = this.apiToken || this.token;

  // Base64 encode credentials for Basic Auth
  this.authHeader = 'Basic ' + Buffer.from(`${this.authUser}:${this.authToken}`).toString('base64');

  this.isConfigured = !!(this.authUser && this.authToken && this.phoneNumber);
    
    if (!this.isConfigured) {
      console.warn('⚠️  Exotel service not configured. Add EXOTEL_SID, EXOTEL_TOKEN, and EXOTEL_PHONE_NUMBER to .env');
    } else {
  // Log masked auth user for debugging (don't log token)
  const maskedUser = this.authUser ? (this.authUser.length > 6 ? `${this.authUser.slice(0,4)}...${this.authUser.slice(-2)}` : this.authUser) : 'N/A';
  console.log('✅ Exotel service configured');
  console.log(`   Phone Number: ${this.phoneNumber}`);
  console.log(`   Using auth user: ${maskedUser}`);
    }
  }

  /**
   * Check if Exotel is properly configured
   */
  isReady() {
    return this.isConfigured;
  }

  /**
   * Make an outbound call
   * @param {string} toNumber - Customer phone number (with country code, e.g., +919876543210)
   * @param {string} callbackUrl - Your webhook URL to handle call events
   * @param {object} customData - Additional data to pass (agent ID, customer context, etc.)
   * @returns {Promise<object>} Call details
   */
  async initiateCall(toNumber, callbackUrl, customData = {}) {
    try {
      if (!this.isReady()) {
        throw new Error('Exotel service not configured');
      }

      // Validate phone number format
      if (!toNumber.startsWith('+')) {
        // Assume Indian number, add +91
        toNumber = '+91' + toNumber.replace(/^0+/, '');
      }

      console.log(`📞 Initiating call to ${toNumber}`);

  // Debug: log constructed base URL and endpoint
  const requestUrl = `${this.baseUrl}/Calls/connect.json`;
  console.log('   Exotel request URL:', requestUrl);

      const response = await axios.post(
        requestUrl,
        new URLSearchParams({
          From: this.phoneNumber, // Your Exotel virtual number
          To: toNumber,
          CallerId: this.phoneNumber,
          Url: callbackUrl, // Webhook for call flow (XML response)
          StatusCallback: callbackUrl + '/status', // Status updates
          CustomField: JSON.stringify(customData) // Pass agent ID, context, etc.
        }),
        {
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('✅ Call initiated successfully');
      console.log('   Call SID:', response.data.Call?.Sid);
      
      return {
        success: true,
        callSid: response.data.Call?.Sid,
        status: response.data.Call?.Status,
        data: response.data.Call
      };
    } catch (error) {
      console.error('❌ Error initiating call:', error.response?.data || error.message);
      throw new Error(`Failed to initiate call: ${error.response?.data?.RestException?.Message || error.message}`);
    }
  }

  /**
   * Get call details
   * @param {string} callSid - Exotel Call SID
   * @returns {Promise<object>} Call details
   */
  async getCallDetails(callSid) {
    try {
      if (!this.isReady()) {
        throw new Error('Exotel service not configured');
      }

      const response = await axios.get(
        `${this.baseUrl}/Calls/${callSid}.json`,
        {
          headers: {
            'Authorization': this.authHeader
          }
        }
      );

      return {
        success: true,
        data: response.data.Call
      };
    } catch (error) {
      console.error('❌ Error getting call details:', error.response?.data || error.message);
      throw new Error(`Failed to get call details: ${error.message}`);
    }
  }

  /**
   * Hangup an active call
   * @param {string} callSid - Exotel Call SID
   * @returns {Promise<object>} Result
   */
  async hangupCall(callSid) {
    try {
      if (!this.isReady()) {
        throw new Error('Exotel service not configured');
      }

      console.log(`📴 Hanging up call: ${callSid}`);

      const response = await axios.post(
        `${this.baseUrl}/Calls/${callSid}`,
        new URLSearchParams({
          Status: 'completed'
        }),
        {
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      console.log('✅ Call hung up successfully');
      
      return {
        success: true,
        data: response.data.Call
      };
    } catch (error) {
      console.error('❌ Error hanging up call:', error.response?.data || error.message);
      throw new Error(`Failed to hangup call: ${error.message}`);
    }
  }

  /**
   * Test authentication and reachability with Exotel by fetching account details
   * @returns {Promise<object>} Result with account info on success
   */
  async testAuth() {
    try {
      if (!this.isReady()) {
        throw new Error('Exotel service not configured');
      }

      // Request account details - this endpoint validates credentials without initiating calls
      const response = await axios.get(`${this.baseUrl}.json`, {
        headers: {
          'Authorization': this.authHeader
        }
      });

      return {
        success: true,
        account: response.data.Account
      };
    } catch (error) {
      console.error('❌ Exotel auth test failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get available phone numbers (IncomingPhoneNumbers) from Exotel account
   * @returns {Promise<object>} List of phone numbers
   */
  async getPhoneNumbers() {
    try {
      if (!this.isReady()) {
        throw new Error('Exotel service not configured');
      }

      const response = await axios.get(`${this.baseUrl}/IncomingPhoneNumbers.json`, {
        headers: {
          'Authorization': this.authHeader
        }
      });

      return {
        success: true,
        numbers: response.data.IncomingPhoneNumbers?.IncomingPhoneNumber || []
      };
    } catch (error) {
      console.error('❌ Error fetching phone numbers:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Generate Exotel Response XML for call flow
   * @param {string} message - Text to speak to caller (will be converted to speech)
   * @param {string} nextAction - URL for next action after speaking
   * @param {object} options - Additional options (voice, language, etc.)
   * @returns {string} Exotel XML
   */
  generateCallFlowXML(message, nextAction = null, options = {}) {
    const {
      voice = 'woman', // 'man' or 'woman'
      language = 'en', // 'en', 'hi', etc.
      recordCall = true,
      waitForInput = false,
      timeout = 10
    } = options;

    let xml = '<?xml version="1.0" encoding="UTF-8"?><Response>';

    // Record the call if needed
    if (recordCall) {
      xml += '<Record maxLength="60" finishOnKey="#">';
    }

    // Speak message
    if (message) {
      xml += `<Say voice="${voice}" language="${language}">${this.escapeXML(message)}</Say>`;
    }

    // Wait for user input (DTMF or speech)
    if (waitForInput) {
      xml += `<Gather timeout="${timeout}" finishOnKey="#">`;
      xml += `<Say voice="${voice}" language="${language}">Please speak or press a key</Say>`;
      xml += '</Gather>';
    }

    if (recordCall) {
      xml += '</Record>';
    }

    // Redirect to next action
    if (nextAction) {
      xml += `<Redirect>${nextAction}</Redirect>`;
    } else {
      xml += '<Hangup/>';
    }

    xml += '</Response>';

    return xml;
  }

  /**
   * Generate XML to play audio file
   * @param {string} audioUrl - URL of audio file to play
   * @param {string} nextAction - URL for next action
   * @returns {string} Exotel XML
   */
  generatePlayAudioXML(audioUrl, nextAction = null) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?><Response>';
    xml += `<Play>${audioUrl}</Play>`;
    
    if (nextAction) {
      xml += `<Redirect>${nextAction}</Redirect>`;
    } else {
      xml += '<Hangup/>';
    }
    
    xml += '</Response>';
    return xml;
  }

  /**
   * Generate XML to record caller's voice
   * @param {number} maxLength - Maximum recording length in seconds
   * @param {string} callbackUrl - URL to post recording to
   * @returns {string} Exotel XML
   */
  generateRecordXML(maxLength = 60, callbackUrl = null) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?><Response>';
    
    const recordAttrs = [
      `maxLength="${maxLength}"`,
      'finishOnKey="#"',
      'playBeep="true"'
    ];
    
    if (callbackUrl) {
      recordAttrs.push(`action="${callbackUrl}"`);
    }
    
    xml += `<Record ${recordAttrs.join(' ')}>`;
    xml += '<Say>Please speak your message after the beep</Say>';
    xml += '</Record>';
    xml += '</Response>';
    
    return xml;
  }

  /**
   * Escape XML special characters
   */
  escapeXML(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Parse incoming webhook data from Exotel
   * @param {object} webhookData - Raw webhook data from Exotel
   * @returns {object} Parsed call data
   */
  parseWebhookData(webhookData) {
    return {
      callSid: webhookData.CallSid,
      from: webhookData.From,
      to: webhookData.To,
      direction: webhookData.Direction, // 'inbound' or 'outbound'
      status: webhookData.Status, // 'init', 'ringing', 'in-progress', 'completed', 'failed'
      duration: webhookData.Duration,
      recordingUrl: webhookData.RecordingUrl,
      recordingDuration: webhookData.RecordingDuration,
      digits: webhookData.Digits, // DTMF input
      customField: webhookData.CustomField ? JSON.parse(webhookData.CustomField) : {},
      startTime: webhookData.StartTime,
      endTime: webhookData.EndTime,
      dateCreated: webhookData.DateCreated,
      dateUpdated: webhookData.DateUpdated
    };
  }

  /**
   * Download call recording
   * @param {string} recordingUrl - Exotel recording URL
   * @returns {Promise<Buffer>} Audio buffer
   */
  async downloadRecording(recordingUrl) {
    try {
      const response = await axios.get(recordingUrl, {
        responseType: 'arraybuffer',
        headers: {
          'Authorization': this.authHeader
        }
      });

      return Buffer.from(response.data);
    } catch (error) {
      console.error('❌ Error downloading recording:', error.message);
      throw new Error(`Failed to download recording: ${error.message}`);
    }
  }
}

// Export singleton instance
const exotelService = new ExotelService();
export default exotelService;
