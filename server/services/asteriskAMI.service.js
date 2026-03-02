/**
 * Asterisk Manager Interface (AMI) Service
 *
 * Connects to the local Asterisk AMI to originate outbound calls.
 * The Originate action dials the user via the SIP trunk, and on answer
 * routes the call into the same AudioSocket pipeline used for inbound.
 *
 * Environment variables:
 *   AMI_HOST     - default "127.0.0.1"
 *   AMI_PORT     - default 5038
 *   AMI_USER     - AMI manager username
 *   AMI_SECRET   - AMI manager password
 *   SIP_TRUNK    - SIP trunk name in Asterisk (default "webphone")
 *   SIP_PREFIX   - Fixed prefix from SIP provider (default "922")
 */

import net from "net";
import { randomUUID } from "crypto";

const AMI_HOST = process.env.AMI_HOST || "127.0.0.1";
const AMI_PORT = parseInt(process.env.AMI_PORT || "5038", 10);
const AMI_USER = process.env.AMI_USER || "admin";
const AMI_SECRET = process.env.AMI_SECRET || "admin";
const SIP_TRUNK = process.env.SIP_TRUNK || "webphone";
const SIP_PREFIX = process.env.SIP_PREFIX || "922";

class AsteriskAMI {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.authenticated = false;
        this._responseBuffer = "";
        this._pendingCallbacks = new Map(); // ActionID -> callback
    }

    /**
     * Connect and authenticate to Asterisk AMI
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.connected && this.authenticated) {
                return resolve();
            }

            this.socket = net.createConnection(AMI_PORT, AMI_HOST);
            let resolved = false;

            this.socket.setEncoding("utf8");

            this.socket.on("connect", () => {
                console.log(`📞 AMI: Connected to ${AMI_HOST}:${AMI_PORT}`);
                this.connected = true;

                // Send login action
                this._send({
                    Action: "Login",
                    Username: AMI_USER,
                    Secret: AMI_SECRET,
                });
            });

            this.socket.on("data", (data) => {
                this._responseBuffer += data;

                // AMI messages are terminated by \r\n\r\n
                while (this._responseBuffer.includes("\r\n\r\n")) {
                    const idx = this._responseBuffer.indexOf("\r\n\r\n");
                    const message = this._responseBuffer.slice(0, idx);
                    this._responseBuffer = this._responseBuffer.slice(idx + 4);

                    const parsed = this._parseMessage(message);

                    // Handle login response
                    if (parsed.Response === "Success" && !this.authenticated) {
                        this.authenticated = true;
                        console.log("📞 AMI: Authenticated successfully");
                        if (!resolved) {
                            resolved = true;
                            resolve();
                        }
                    } else if (parsed.Response === "Error" && !this.authenticated) {
                        console.error("📞 AMI: Authentication failed:", parsed.Message);
                        if (!resolved) {
                            resolved = true;
                            reject(new Error(`AMI authentication failed: ${parsed.Message}`));
                        }
                    }

                    // Handle action responses
                    if (parsed.ActionID && this._pendingCallbacks.has(parsed.ActionID)) {
                        const cb = this._pendingCallbacks.get(parsed.ActionID);
                        this._pendingCallbacks.delete(parsed.ActionID);
                        cb(parsed);
                    }
                }
            });

            this.socket.on("error", (err) => {
                console.error("📞 AMI: Socket error:", err.message);
                this.connected = false;
                this.authenticated = false;
                if (!resolved) {
                    resolved = true;
                    reject(err);
                }
            });

            this.socket.on("close", () => {
                console.log("📞 AMI: Connection closed");
                this.connected = false;
                this.authenticated = false;
            });

            // Timeout
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    reject(new Error("AMI connection timeout (5s)"));
                }
            }, 5000);
        });
    }

    /**
     * Send a raw AMI action
     */
    _send(action) {
        if (!this.socket || !this.connected) {
            throw new Error("AMI not connected");
        }
        let msg = "";
        for (const [key, value] of Object.entries(action)) {
            msg += `${key}: ${value}\r\n`;
        }
        msg += "\r\n";
        this.socket.write(msg);
    }

    /**
     * Send an AMI action and wait for a response
     */
    _sendAction(action) {
        return new Promise((resolve, reject) => {
            const actionId = randomUUID();
            action.ActionID = actionId;

            this._pendingCallbacks.set(actionId, resolve);

            // Timeout for response
            setTimeout(() => {
                if (this._pendingCallbacks.has(actionId)) {
                    this._pendingCallbacks.delete(actionId);
                    reject(new Error("AMI action timeout (10s)"));
                }
            }, 10000);

            this._send(action);
        });
    }

    /**
     * Parse an AMI response message into key-value pairs
     */
    _parseMessage(raw) {
        const result = {};
        const lines = raw.split("\r\n");
        for (const line of lines) {
            const colonIdx = line.indexOf(":");
            if (colonIdx > -1) {
                const key = line.slice(0, colonIdx).trim();
                const value = line.slice(colonIdx + 1).trim();
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Originate an outbound call
     *
     * Dials the user's phone via the SIP trunk:
     *   Channel: SIP/<trunk>/<prefix>+91<did><phoneNumber>
     *
     * On answer, the call is routed to the ai-agent context which connects
     * to AudioSocket for the same AI pipeline as inbound calls.
     *
     * @param {string} did - DID number linked to the agent (digits only, no +91)
     * @param {string} phoneNumber - User's 10-digit phone number
     * @param {string} callbackHost - Backend host:port for AudioSocket
     * @returns {Promise<{success: boolean, uuid: string}>}
     */
    async originate(did, phoneNumber, callbackHost) {
        // Ensure connected
        if (!this.connected || !this.authenticated) {
            await this.connect();
        }

        // Generate UUID for this call
        const uuid = randomUUID();

        // Build the SIP dial string: 922+91{DID}{PHONE}
        const dialString = `${SIP_PREFIX}+91${did}${phoneNumber}`;
        const channel = `SIP/${SIP_TRUNK}/${dialString}`;

        console.log(`📞 AMI Originate: ${channel}`);
        console.log(`   UUID: ${uuid}`);
        console.log(`   DID: ${did}, Phone: ${phoneNumber}`);

        // Extract just the DID digits (the number linked to agent, used for agent lookup)
        const didWithCountry = `91${did}`;

        const response = await this._sendAction({
            Action: "Originate",
            Channel: channel,
            Context: "outbound-ai",
            Exten: "s",
            Priority: "1",
            CallerID: `"AI Agent" <${did}>`,
            Timeout: "30000", // 30 seconds ring timeout
            Async: "true",
            Variable: `AUDIOSOCKET_UUID=${uuid},AUDIOSOCKET_DID=${didWithCountry}`,
        });

        if (response.Response === "Success") {
            console.log(`📞 AMI: Call originated successfully (UUID: ${uuid})`);
            return { success: true, uuid };
        } else {
            const errMsg = response.Message || "Originate failed";
            console.error(`📞 AMI: Originate failed:`, errMsg);
            throw new Error(errMsg);
        }
    }

    /**
     * Disconnect from AMI
     */
    disconnect() {
        if (this.socket) {
            try {
                this._send({ Action: "Logoff" });
                this.socket.end();
            } catch (e) {
                // ignore
            }
            this.socket = null;
            this.connected = false;
            this.authenticated = false;
        }
    }
}

// Singleton
const asteriskAMI = new AsteriskAMI();

export default asteriskAMI;
