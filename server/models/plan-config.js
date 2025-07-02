// src/models/plan-config.js

export const PLAN_RULES = {
  basic: {
    maxConnectors: 2,
    canInviteUsers: false,
    showAdvancedSettings: false,
    syncIntervalHours: 24, // Daily
    features: ["sync", "logs"],
    manualSyncLimitPerConnectorPerDay: 0,
  },

  pro: {
    maxConnectors: 5,
    canInviteUsers: true,
    showAdvancedSettings: true,
    syncIntervalHours: 1, // Hourly
    features: ["sync", "logs", "auditLogs", "manualSync"],
    manualSyncLimitPerConnectorPerDay: 1, // ⏱️ 1 manual sync per connector/day
  },

  enterprise: {
    maxConnectors: 999,
    canInviteUsers: true,
    showAdvancedSettings: true,
    syncIntervalHours: 1, // Still hourly, but could customize
    features: ["sync", "logs", "auditLogs", "manualSync"],
    manualSyncLimitPerConnectorPerDay: Infinity, // 🚀 unlimited
  },
};
