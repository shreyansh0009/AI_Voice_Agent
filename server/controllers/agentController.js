import { asyncHandler } from '../middleware/asyncHandler.js';
import fileManagementService from '../services/fileManagementService.js';

/**
 * Get agent statistics
 */
export const getAgentStats = asyncHandler(async (req, res) => {
  const { agentId } = req.params;
  const stats = fileManagementService.getAgentStats(agentId);

  res.json({
    success: true,
    stats,
  });
});

/**
 * Get all agents
 */
export const getAllAgents = asyncHandler(async (req, res) => {
  const agentIds = fileManagementService.getAllAgentIds();

  res.json({
    success: true,
    agents: agentIds,
  });
});
