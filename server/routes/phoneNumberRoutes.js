import express from "express";
import {
  getAllPhoneNumbers,
  getAvailablePhoneNumbers,
  getAgentPhoneNumber,
  linkPhoneNumber,
  unlinkPhoneNumber,
} from "../controllers/phoneNumberController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(authenticate);

// Get all phone numbers
router.get("/", getAllPhoneNumbers);

// Get available (unlinked) phone numbers
router.get("/available", getAvailablePhoneNumbers);

// Get phone number linked to specific agent
router.get("/agent/:agentId", getAgentPhoneNumber);

// Link phone number to agent
router.post("/:number/link", linkPhoneNumber);

// Unlink phone number from agent
router.post("/:number/unlink", unlinkPhoneNumber);

export default router;
