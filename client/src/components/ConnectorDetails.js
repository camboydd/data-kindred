import React, { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { formatDistanceToNowStrict } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import "./SyncManagementPage.css";

const REFRESH_OPTIONS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Full refresh 🔒", value: "full", adminOnly: true },
];

const ConnectorDetails = ({ connector, logs, user, onRefreshLogs }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedRange, setSelectedRange] = useState("7d");
  const [isLoading, setIsLoading] = useState(false);
  const [lastSync, setLastSync] = useState({
    time: null,
    rows: null,
    error: null,
  });

  useEffect(() => {
    const latest = logs
      ?.filter((l) => l.completedAt)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];

    if (latest) {
      setLastSync({
        time: latest.completedAt,
        rows: latest.rowCount ?? null,
        error: latest.errorMessage ?? null,
      });
    }
  }, [logs]);

  const handleManualSync = async () => {
    setIsLoading(true);
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
    }
  };

  const formatDate = (iso) => {
    if (!iso) return "N/A";
    return formatInTimeZone(
      new Date(iso),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      "Pp zzz"
    );
  };

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
    <div className="details-panel">
      <div className="connector-header">
        <h1>{connector.connectorId}</h1>
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
            {isLoading ? "Syncing..." : "Run Manual Sync"}
          </button>
        </div>
      </div>

      <div className="tabs">
        <button
          className={activeTab === "overview" ? "active" : ""}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          className={activeTab === "logs" ? "active" : ""}
          onClick={() => setActiveTab("logs")}
        >
          Logs
        </button>
        <button
          className={activeTab === "errors" ? "active" : ""}
          onClick={() => setActiveTab("errors")}
        >
          Errors
        </button>
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
              <span className="value">{lastSync.rows ?? "N/A"}</span>
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
              <p>No logs found.</p>
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
    </div>
  );
};

export default ConnectorDetails;
