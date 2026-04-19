/**
 * Document Verification Action Handler
 *
 * Handles external API calls to the DocVerify Express server
 * during flow execution. Called by asteriskBridge when an action step
 * with actionId "VERIFY_DOCUMENT" is encountered.
 */

import axios from "axios";

const DOC_VERIFY_API = process.env.DOC_VERIFY_API_URL; // e.g., http://localhost:8000
const DOC_VERIFY_KEY = process.env.DOC_VERIFY_API_KEY;

const apiClient = axios.create({
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "x-voice-agent-key": DOC_VERIFY_KEY,
  },
});

/**
 * Check document status by hash
 *
 * @param {string} documentHash - The document hash
 * @returns {object} { success, responseText }
 */
async function verifyDocument(documentHash) {
  if (!DOC_VERIFY_API) {
    return {
      success: false,
      responseText:
        "Document verification service is not configured. Please contact support.",
    };
  }

  try {
    const { data } = await apiClient.post(
      `${DOC_VERIFY_API}/api/v1/voice/verify`,
      { hash: documentHash }
    );

    const d = data.data;

    if (!d || !d.found) {
      return {
        success: false,
        responseText:
          "This document was not found in our system. Please double-check the verification code and try again.",
      };
    }

    switch (d.status) {
      case "ISSUED":
        return {
          success: true,
          responseText:
            `Great news! Your document "${d.documentName}" has been issued and verified. ` +
            `It belongs to ${d.ownerName}, issued by ${d.issuedBy} from the ${d.department} department` +
            (d.issuedAt
              ? ` on ${new Date(d.issuedAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`
              : "") +
            `.`,
        };

      case "PENDING":
        return {
          success: true,
          responseText:
            `Your document "${d.documentName}" is currently pending approval. ` +
            `It was uploaded by ${d.ownerName} and is being reviewed. ` +
            `You will be notified once a decision is made.`,
        };

      case "REJECTED":
        return {
          success: true,
          responseText:
            `Your document "${d.documentName}" was rejected.` +
            (d.rejectionReason
              ? ` The reason given was: ${d.rejectionReason}.`
              : "") +
            ` Please re-upload a corrected version through the student portal.`,
        };

      case "REVOKED":
        return {
          success: true,
          responseText:
            `Your document "${d.documentName}" was previously issued but has since been revoked. Please contact your institution for details.`,
        };

      default:
        return {
          success: false,
          responseText: `Your document "${d.documentName}" has status: ${d.status}. Please contact support for more information.`,
        };
    }
  } catch (error) {
    const errMsg = error.response?.data?.message || error.message;
    console.error("DocVerify API error:", errMsg);

    if (error.response?.status === 404) {
      return {
        success: false,
        responseText:
          "This document was not found in our system. Please make sure the verification code is correct.",
      };
    }

    return {
      success: false,
      responseText:
        "I'm having trouble connecting to the verification service right now. Please try again later.",
    };
  }
}

/**
 * Execute a document verification action by actionId
 *
 * @param {string} actionId - "VERIFY_DOCUMENT"
 * @param {object} collectedData - Data collected from flow (documentHash, etc.)
 * @returns {object} { success, responseText, dataKey }
 */
async function executeAction(actionId, collectedData = {}) {
  switch (actionId) {
    case "VERIFY_DOCUMENT":
      const verifyResult = await verifyDocument(collectedData.documentHash);
      return {
        ...verifyResult,
        dataKey: "verificationResult",
      };

    default:
      return {
        success: false,
        responseText: "Unknown action requested.",
        dataKey: null,
      };
  }
}

export default {
  verifyDocument,
  executeAction,
};
