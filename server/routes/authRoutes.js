import express from "express";
import {
  signup,
  login,
  logout,
  verifyToken,
  googleLogin,
} from "../controllers/authController.js";

const router = express.Router();

router.post(
  "/signup",
  (req, res, next) => {
    console.log("🟢 AUTH ROUTE: /signup called");
    next();
  },
  signup
);

router.post(
  "/login",
  (req, res, next) => {
    console.log("🟢 AUTH ROUTE: /login called");
    next();
  },
  login
);

router.post(
  "/logout",
  (req, res, next) => {
    console.log("🟢 AUTH ROUTE: /logout called");
    next();
  },
  logout
);

router.get(
  "/verify",
  (req, res, next) => {
    console.log("🟢 AUTH ROUTE: /verify called");
    next();
  },
  verifyToken
);

router.post(
  "/google",
  (req, res, next) => {
    console.log("🟢 AUTH ROUTE: /google called");
    next();
  },
  googleLogin
);

export default router;
