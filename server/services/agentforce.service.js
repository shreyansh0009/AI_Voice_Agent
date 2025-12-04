import axios from "axios";
import qs from "qs";
import dotenv from "dotenv";
dotenv.config();

class AIAgentService {
  constructor() {
    this.clientId = process.env.SF_CLIENT_ID;
    this.clientSecret = process.env.SF_CLIENT_SECRET;
    this.agentId = process.env.SF_AGENT_ID;
  }

  async getToken() {
    const data = qs.stringify({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret
    });

    this.isConfigured = !!process.env.SF_CLIENT_ID && !!process.env.SF_CLIENT_SECRET && !!process.env.SF_AGENT_ID;

    if (!this.isConfigured) {
      console.warn('⚠️  OpenAI not configured. Add SF_CLIENT_ID, SF_CLIENT_SECRET, SF_AGENT_ID to .env');
    }

    const res = await axios.post(
      "https://api.salesforce.com/services/oauth2/token",
      data,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    return res.data.access_token;
  }

  async askAgentforce(message) {
    const token = await this.getToken();

    const res = await axios.post(
      `https://api.salesforce.com/agentforce/agents/${this.agentId}/inference`,
      { messages: [{ role: "user", content: message }] },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data.output[0].content;
  }
}

export default new AIAgentService();
