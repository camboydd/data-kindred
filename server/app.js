import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { expressjwt as jwt } from "express-jwt";
import snowflake from "snowflake-sdk";

import { userRouter } from "./routes/users-routes.js";
import { adminRouter } from "./routes/admin-routes.js";
import { snowflakeRouter } from "./routes/snowflake-routes.js";
import { connectorsRouter } from "./routes/connectors-routes.js";
import { runRouter } from "./routes/run-routes.js";
import { auditRouter } from "./routes/audit-routes.js";
import { etlAnalyticsRouter } from "./routes/etl-analytics-routes.js";
import stripeWebhookRouter from "./routes/stripe-webhook.js";
import {
  connectToSnowflake,
  executeQuery,
} from "./util/snowflake-connection.js";

dotenv.config();
const app = express();
const JWT_SECRET = process.env.JWT_SECRET;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Snowflake logger
snowflake.configure({
  logger: {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
});

// === Middlewares ===
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

// HTTPS redirect in production
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === "production" &&
    req.header("x-forwarded-proto") !== "https"
  ) {
    return res.redirect(`https://${req.header("host")}${req.url}`);
  }
  next();
});

// Log incoming requests
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.originalUrl}`);
  console.log("Request Body:", req.body);
  next();
});

// Static frontend build
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "..", "client", "build")));

// JWT middleware
const pathsWithoutAuth = [
  /^\/static\/.*/,
  "/",
  "/reset-password",
  "/forgot-password",
  "/user-registration",
  "/user-registration/verify",
  "/setup-password",
  "/api/users/forgot-password",
  "/api/users/reset-password",
  "/api/users/reset-password/verify",
  "/api/users/user-registration",
  "/api/users/user-registration/verify",
  "/api/users/login",
  "/api/users/simple-login",
  "/api/users/getsimpleuseremail",
  "/api/users/setup-password",
  "/api/users/request-password-reset",
  "/api/users/request-access",
  "/api/snowflake/configs",
  "/api/snowflake/oauth",
  "/api/snowflake/oauth/authorize",
  "/api/connectors/setup",
  "/api/connectors/status",
  "/api/run", // keep open for now
  /^\/api\/snowflake\/oauth\/.*/,
  "/api/users/check-auth",
];

const jwtMiddleware = jwt({
  secret: JWT_SECRET,
  algorithms: ["HS256"],
  getToken: (req) => req.cookies?.token,
});

// Apply JWT unless public route
app.use((req, res, next) => {
  const isPublic = pathsWithoutAuth.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(req.path) : pattern === req.path
  );
  if (isPublic) return next();
  return jwtMiddleware(req, res, next);
});

// Plan enforcement middleware
const requireValidPlan = async (req, res, next) => {
  const allowedPlans = ["Basic", "Pro", "Enterprise"];
  let plan = req.user?.plan;

  if (!plan) {
    try {
      const conn = await connectToSnowflake();
      const result = await executeQuery(
        conn,
        `SELECT PLAN FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
        [req.user?.accountId]
      );
      plan = result?.[0]?.PLAN;
    } catch (err) {
      console.error("Failed to fetch plan from DB:", err);
      return res.status(500).json({ message: "Plan verification failed." });
    }
  }

  if (!allowedPlans.includes(plan)) {
    console.warn(`❌ Access blocked. Invalid plan: ${plan}`);
    return res.status(403).json({
      success: false,
      message:
        "Your plan is inactive or missing. Please upgrade your subscription.",
    });
  }

  next();
};

// === Mount routes ===
app.use("/api/users", userRouter);
app.use("/api/admin", adminRouter);
app.use("/api/connectors", connectorsRouter);
app.use("/api/audit", auditRouter);
app.use("/api/stripe", stripeWebhookRouter);

// Plan-protected routes
app.use("/api/snowflake", requireValidPlan, snowflakeRouter);
app.use("/api/run", requireValidPlan, runRouter);
app.use("/api/etl", requireValidPlan, etlAnalyticsRouter);

// JWT error handler
app.use((err, req, res, next) => {
  if (err.name === "UnauthorizedError") {
    console.warn("🔒 Unauthorized access:", err.message);
    const acceptsHtml = req.headers.accept?.includes("text/html");
    if (acceptsHtml && !req.originalUrl.startsWith("/api/users")) {
      const redirectUrl = `${
        process.env.FRONTEND_URL
      }/login?next=${encodeURIComponent(req.originalUrl)}`;
      return res.redirect(302, redirectUrl);
    }
    return res.status(401).json({
      error: "Unauthorized – invalid or missing token.",
    });
  }
  next(err);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// Frontend catch-all
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "build", "index.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
