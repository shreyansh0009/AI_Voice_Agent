import express from "express";
import {
  getAllPhoneNumbers,
  getAvailablePhoneNumbers,
  getUserOwnedNumbers,
  getAgentPhoneNumber,
  linkPhoneNumber,
  unlinkPhoneNumber,
  purchasePhoneNumber,
  renewPhoneNumber,
  releasePhoneNumber,
} from "../controllers/phoneNumberController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(authenticate);

// Get all phone numbers
router.get("/", getAllPhoneNumbers);

// Get available (unlinked) phone numbers - for purchasing
router.get("/available", getAvailablePhoneNumbers);

// Get user's owned numbers available for linking (with valid subscription)
router.get("/owned", getUserOwnedNumbers);

// Get phone number linked to specific agent
router.get("/agent/:agentId", getAgentPhoneNumber);

// Purchase a phone number
router.post("/:number/purchase", purchasePhoneNumber);

// Renew phone number subscription
router.post("/:number/renew", renewPhoneNumber);

// Link phone number to agent
router.post("/:number/link", linkPhoneNumber);

// Unlink phone number from agent
router.post("/:number/unlink", unlinkPhoneNumber);

// Release (delete) phone number - clears ownership, returns to available
router.post("/:number/release", releasePhoneNumber);

export default router;
