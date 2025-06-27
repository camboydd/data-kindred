export const PLAN_RULES = {
  Basic: {
    maxConnectors: 2,
    canInviteUsers: false,
    showAdvancedSettings: false,
    features: ["sync", "logs"],
    limits: {
      autoSyncFrequencyMinutes: 1440, // once per day
    },
  },
  Pro: {
    maxConnectors: 5,
    canInviteUsers: true,
    showAdvancedSettings: true,
    features: ["sync", "logs", "auditLogs", "manualSync"],
    limits: {
      autoSyncFrequencyMinutes: 60, // once per hour
      manualSyncPerConnectorPerDay: 1,
    },
  },
  Enterprise: {
    maxConnectors: 999,
    canInviteUsers: true,
    showAdvancedSettings: true,
    features: ["sync", "logs", "errorMonitoring", "customRoles"],
  },
};
