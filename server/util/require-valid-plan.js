import { connectToSnowflake, executeQuery } from "./snowflake-connection.js";

export const requireValidPlan = async (req, res, next) => {
  const allowedPlans = ["Basic", "Pro", "Enterprise"];
  let plan = req.user?.plan;
  const accountId = req.user?.accountId;

  if (!accountId) {
    console.error("❌ Missing accountId in request user context.");
    return res
      .status(401)
      .json({ message: "Unauthorized. No account ID found." });
  }

  if (!plan) {
    try {
      const conn = await connectToSnowflake();
      const result = await executeQuery(
        conn,
        `SELECT PLAN FROM KINDRED.PUBLIC.ACCOUNTS WHERE ID = ?`,
        [accountId]
      );
      plan = result?.[0]?.PLAN;
      req.user.plan = plan; // ✅ Store plan on req.user
    } catch (err) {
      console.error("❌ Failed to fetch plan from DB:", err);
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
