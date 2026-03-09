import express from "express";
import { campaignUpload } from "../config/campaignMulter.js";
import {
  getAvailableChannels,
  uploadCampaign,
  startCampaign,
  listCampaigns,
  getCampaign,
  deleteCampaign,
} from "../controllers/campaignController.js";

const router = express.Router();

// GET  /api/campaigns/available-channels
router.get("/available-channels", getAvailableChannels);

// GET  /api/campaigns
router.get("/", listCampaigns);

// GET  /api/campaigns/:id
router.get("/:id", getCampaign);

// POST /api/campaigns/upload  (multipart: file + name + agentId)
router.post("/upload", campaignUpload.single("file"), uploadCampaign);

// POST /api/campaigns/:id/start
router.post("/:id/start", startCampaign);

// DELETE /api/campaigns/:id
router.delete("/:id", deleteCampaign);

export default router;
