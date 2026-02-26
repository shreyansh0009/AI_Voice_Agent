import express from "express";
import {
  getTrialLeadById,
  listTrialLeads,
  releaseTrialLead,
  startTrial,
} from "../controllers/trialController.js";
import { requireAdminKey } from "../middleware/adminKey.js";

const router = express.Router();

router.post("/start", startTrial);
router.get("/leads", requireAdminKey, listTrialLeads);
router.get("/leads/:id", requireAdminKey, getTrialLeadById);
router.post("/leads/:id/release", requireAdminKey, releaseTrialLead);

export default router;
