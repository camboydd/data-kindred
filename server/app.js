import express from "express";
import { userRouter } from "./routes/users-routes.js";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { expressjwt as jwt } from "express-jwt";
import { adminRouter } from "./routes/admin-routes.js";
import { snowflakeRouter } from "./routes/snowflake-routes.js";
import cookieParser from "cookie-parser";
import { connectorsRouter } from "./routes/connectors-routes.js";
import { runRouter } from "./routes/run-routes.js";
import { auditRouter } from "./routes/audit-routes.js";
import { etlAnalyticsRouter } from "./routes/etl-analytics-routes.js";
import snowflake from "snowflake-sdk";

snowflake.configure({
  logger: {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
});

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const JWT_SECRET = process.env.JWT_SECRET;

// Parse JSON body
app.use(express.json());

// Parse cookies
app.use(cookieParser());
// Enable CORS for frontend origin
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

// Redirect HTTP to HTTPS in production
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === "production" &&
    req.header("x-forwarded-proto") !== "https"
  ) {
    return res.redirect(`https://${req.header("host")}${req.url}`);
  }
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.originalUrl}`);
  console.log("Request Body:", req.body);
  next();
});

// Serve static files and React build
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "..", "client", "build")));

// Paths that don't require JWT
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
  "/api/connectors/setup",
  "/api/connectors/status",
  "/api/snowflake/oauth/authorize",
  "/api/run",
  /^\/api\/snowflake\/oauth\/.*/,
  "/api/users/check-auth",
];
// JWT auth middleware
const jwtMiddleware = jwt({
  secret: JWT_SECRET,
  algorithms: ["HS256"],
  getToken: (req) => {
    return req.cookies?.token;
  },
});

// Apply JWT only to protected routes
app.use((req, res, next) => {
  const isPublic = pathsWithoutAuth.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(req.path) : pattern === req.path
  );
  if (isPublic) return next();
  return jwtMiddleware(req, res, next);
});

// Mount user routes
app.use("/api/users", userRouter);
app.use("/api/admin", adminRouter);
app.use("/api/snowflake", snowflakeRouter);
app.use("/api/connectors", connectorsRouter);
app.use("/api/run", runRouter);
app.use("/api/etl", etlAnalyticsRouter);
app.use("/api/audit", auditRouter);

// JWT error handler
app.use((err, req, res, next) => {
  if (err.name === "UnauthorizedError") {
    console.error("Unauthorized error:", err.message);
    return res.status(401).json({ error: "Invalid or missing token" });
  }
  next(err);
});
// Global JSON error handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);

  // If response has already been sent, skip
  if (res.headersSent) return next(err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// React frontend catch-all (non-API GETs)
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "build", "index.html"));
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
