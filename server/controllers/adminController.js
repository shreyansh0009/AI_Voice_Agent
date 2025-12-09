import User from "../models/User.js";
import Agent from "../models/Agent.js";
import fileManagementService from "../services/fileManagementService.js";

export const getStats = async (req, res) => {
  console.log("🔵 ADMIN STATS: Handler started", { userId: req.user.id });

  try {
    // 1. Total Users
    const totalUsers = await User.countDocuments();

    // 2. Active Agents (Count all for now, or filter by 'active' if applicable)
    // Checking Agent model structure might be useful, assuming standard Model
    const activeAgents = await Agent.countDocuments();

    // 3. Recent Activity (Last 5 users created)
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("-password"); // Exclude password

    // 4. System Health (Mock for now, or check DB connection)
    const systemHealth = "Good"; // You could check DB connection state here

    // 5. Revenue (Mock for now)
    const revenue = 0;

    const stats = {
      totalUsers,
      activeAgents,
      revenue,
      systemHealth,
      recentActivity: recentUsers.map((user) => ({
        type: "User Created",
        description: `User ${user.email} joined`,
        time: user.createdAt,
        id: user._id,
      })),
    };

    console.log("✅ ADMIN STATS: Success", stats);
    res.json(stats);
  } catch (error) {
    console.error("❌ ADMIN STATS: Error", error);
    res.status(500).json({ message: "Failed to fetch admin stats" });
  }
};

export const getUsersDetails = async (req, res) => {
  console.log("🔵 ADMIN USERS DETAILS: Handler started", {
    userId: req.user.id,
  });

  try {
    // Fetch all users
    const users = await User.find().select("-password").sort({ createdAt: -1 });

    // Fetch all agents
    const agents = await Agent.find();

    // Aggregate data
    const usersWithDetails = await Promise.all(
      users.map(async (user) => {
        // Find agents for this user
        const userAgents = agents.filter(
          (agent) => agent.userId.toString() === user._id.toString()
        );

        // Attach files to each agent
        const agentsWithFiles = userAgents.map((agent) => {
          const files = fileManagementService.getAllFiles(agent._id.toString());
          return {
            ...agent.toObject(),
            files: files || [],
          };
        });

        return {
          ...user.toObject(),
          agents: agentsWithFiles,
        };
      })
    );

    console.log("✅ ADMIN USERS DETAILS: Success", {
      count: usersWithDetails.length,
    });
    res.json(usersWithDetails);
  } catch (error) {
    console.error("❌ ADMIN USERS DETAILS: Error", error);
    res.status(500).json({ message: "Failed to fetch users details" });
  }
};
