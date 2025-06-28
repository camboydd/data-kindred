import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { formatDistanceToNowStrict } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import UpgradeModal from "../components/UpgradeModal";
import { PLAN_RULES } from "../util/plan-config";

import "./SyncManagementPage.css";

const REFRESH_OPTIONS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  //{ label: "Full refresh 🔒", value: "full", adminOnly: true },
];

const ConnectorDetails = ({
  connector,
  logs,
  user,
  onRefreshLogs,
  logsLoading,
}) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedRange, setSelectedRange] = useState("7d");
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState({
    time: null,
    rows: null,
    error: null,
  });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const syncKey = `syncing_${connector?.connectorId}`;

  useEffect(() => {
    const latest = logs
      ?.filter((l) => l.completedAt || l.startedAt)
      .sort((a, b) => {
        const dateA = new Date(a.completedAt || a.startedAt);
        const dateB = new Date(b.completedAt || b.startedAt);
        return dateB - dateA;
      })[0];

    const stillRunning =
      latest?.status === "in_progress" ||
      (!latest?.completedAt && !!latest?.startedAt);

    if (stillRunning) {
      setIsLoading(true);
      localStorage.setItem(syncKey, "true");
    } else {
      setIsLoading(false);
      localStorage.removeItem(syncKey);
    }

    if (latest) {
      setLastSync({
        time: latest.completedAt || latest.startedAt,
        rows: latest.rowCount ?? (stillRunning ? "In Progress" : "N/A"),
        error: latest.errorMessage ?? null,
      });
    }
  }, [logs]);

  useEffect(() => {
    if (localStorage.getItem(syncKey) === "true") {
      setIsLoading(true);
    }
  }, [connector?.connectorId]);

  useEffect(() => {
    let interval;
    if (isLoading && connector?.connectorId) {
      interval = setInterval(() => {
        onRefreshLogs(connector.connectorId);
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isLoading, connector?.connectorId]);

  const handleManualSync = async () => {
    const isBasic = user?.plan === "Basic";
    const limit =
      PLAN_RULES[user?.plan]?.manualSyncLimitPerConnectorPerDay ?? 0;
    const today = new Date().toISOString().split("T")[0];

    const todaysLogs = logs.filter((log) => log.startedAt?.startsWith(today));

    if (isBasic && todaysLogs.length >= limit) {
      setShowUpgradeModal(true);
      return;
    }
    setIsLoading(true);
    localStorage.setItem(syncKey, "true");
    const toastId = toast.loading("Syncing...");

    try {
      const res = await fetch(`/api/connectors/sync/manual`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId: connector.connectorId,
          refreshWindow: selectedRange,
          accountId: user.accountId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Sync failed");

      toast.success("✅ Sync completed", { id: toastId });
      setLastSync({
        time: data.syncedAt,
        rows: data.rowCount,
        error: data.errorMessage,
      });

      if (data.errors?.length) {
        const aggregated = aggregateErrors(data.errors);
        toast.error(`⚠️ Issues:\n${aggregated.join("\n")}`);
      }

      onRefreshLogs(connector.connectorId);
    } catch (err) {
      toast.error("❌ Sync failed", { id: toastId });
    } finally {
      setIsLoading(false);
      localStorage.removeItem(syncKey);
    }
  };

  const formatDate = (iso) =>
    iso
      ? formatInTimeZone(
          new Date(iso),
          Intl.DateTimeFormat().resolvedOptions().timeZone,
          "Pp zzz"
        )
      : "N/A";

  const aggregateErrors = (errors) => {
    const counts = {};
    for (const err of errors || []) {
      const msg = err.error || err.message || "Unknown error";
      counts[msg] = (counts[msg] || 0) + 1;
    }
    return Object.entries(counts).map(([msg, count]) => `${count}× ${msg}`);
  };

  if (!connector)
    return <div className="details-panel">Select a connector</div>;

  return (
    <div className="details-panel" key={connector.connectorId}>
      <div className="connector-header">
        <h1>{connector.name || connector.connectorId}</h1>
        <div className="sync-controls">
          <select
            value={selectedRange}
            onChange={(e) => setSelectedRange(e.target.value)}
          >
            {REFRESH_OPTIONS.map(
              (opt) =>
                (!opt.adminOnly || user?.role === "admin") && (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                )
            )}
          </select>
          <button onClick={handleManualSync} disabled={isLoading}>
            {isLoading ? (
              <>
                Syncing
                <span className="sync-spinner" />
              </>
            ) : (
              "Run Manual Sync"
            )}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="sync-status-banner">
          Sync in progress... This panel will update automatically.
        </div>
      )}

      <div className="tabs">
        {["overview", "logs", "errors"].map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {activeTab === "overview" && (
          <div className="overview-section">
            <div className="overview-item">
              <span className="label">Last Sync</span>
              <span className="value">
                {lastSync.time
                  ? formatDistanceToNowStrict(new Date(lastSync.time), {
                      addSuffix: true,
                    })
                  : "Never"}
              </span>
            </div>
            <div className="overview-item">
              <span className="label">Rows Imported</span>
              <span className="value">
                {lastSync.rows === "In Progress" ? (
                  <>
                    In Progress <span className="sync-spinner" />
                  </>
                ) : (
                  lastSync.rows ?? "N/A"
                )}
              </span>
            </div>
            {lastSync.error && (
              <div className="error-banner">⚠️ {lastSync.error}</div>
            )}
          </div>
        )}

        {activeTab === "logs" && (
          <div className="logs-table">
            {logs?.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDate(log.createdAt)}</td>
                      <td>{log.durationSeconds?.toFixed(1) ?? "?"}s</td>
                      <td>{log.status}</td>
                      <td>{log.rowCount ?? "?"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state">No logs found.</p>
            )}
          </div>
        )}

        {activeTab === "errors" && (
          <div className="errors-section">
            {aggregateErrors(
              logs.flatMap((log) =>
                log.errors?.length
                  ? log.errors
                  : log.errorMessage
                  ? [{ message: log.errorMessage }]
                  : []
              )
            ).length === 0 ? (
              <p className="empty-state">No errors found.</p>
            ) : (
              <ul className="error-list">
                {aggregateErrors(
                  logs.flatMap((log) =>
                    log.errors?.length
                      ? log.errors
                      : log.errorMessage
                      ? [{ message: log.errorMessage }]
                      : []
                  )
                ).map((err, i) => (
                  <li key={i} className="error-item">
                    ⚠️ {err}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {showUpgradeModal && (
        <UpgradeModal
          planName={user?.plan}
          onClose={() => setShowUpgradeModal(false)}
        />
      )}
    </div>
  );
};

export default ConnectorDetails;
