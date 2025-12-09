import express from "express";
import { authenticate, authorize } from "../middleware/authMiddleware.js";
import { getStats, getUsersDetails } from "../controllers/adminController.js";

const router = express.Router();

console.log("🛠️ Admin Routes loaded");

router.use((req, res, next) => {
  console.log("🛡️ Admin Router middleware hit", { path: req.path });
  next();
});

// Protect all admin routes with authentication AND 'admin' role check

router.get(
  "/stats",
  (req, res, next) => {
    console.log("🛡️ Admin Stats route matched - executing middleware");
    next();
  },
  authenticate,
  (req, res, next) => {
    console.log("🛡️ Post-Authenticate middleware");
    next();
  },
  authorize("admin"),
  (req, res, next) => {
    console.log("🛡️ Post-Authorize middleware, Pre-Controller");
    next();
  },
  getStats
);

router.get("/users-details", authenticate, authorize("admin"), getUsersDetails);

export default router;
