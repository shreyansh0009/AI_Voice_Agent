/**
 * Twilio Telephony Service
 * Equivalent of asteriskAMI.service.js but for Twilio REST API.
 * Uses per-agent credentials to support multi-tenant usage.
 */
import twilio from "twilio";

class TwilioService {
  /**
   * Place an outbound call via Twilio
   * @param {string} accountSid - Twilio Account SID
   * @param {string} authToken - Twilio Auth Token
   * @param {string} from - Twilio phone number (E.164)
   * @param {string} to - Destination phone number (E.164)
   * @param {string} webhookUrl - TwiML webhook URL for call handling
   * @param {string} statusCallbackUrl - Status callback URL
   * @returns {Promise<Object>} - Twilio Call resource
   */
  async createCall(accountSid, authToken, from, to, webhookUrl, statusCallbackUrl) {
    const client = twilio(accountSid, authToken);

    const call = await client.calls.create({
      to,
      from,
      url: webhookUrl,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    });

    console.log(`📞 Twilio call created: ${call.sid} (${from} → ${to})`);
    return call;
  }
}

export default new TwilioService();
