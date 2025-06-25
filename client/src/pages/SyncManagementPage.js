import React, { useEffect, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { formatDistanceToNowStrict } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import "./SyncManagementPage.css";

const REFRESH_OPTIONS = [
  { label: "Last 7 days", value: "7d" },
  { label: "Last 30 days", value: "30d" },
  { label: "Last 90 days", value: "90d" },
  { label: "Full refresh", value: "full", adminOnly: true },
];

const CONNECTOR_LABELS = {
  nclarity: "nClarity",
  sageintacct: "Sage Intacct",
};

const SCRIPT_LABELS = {
  METADATA: "Metadata",
  TELEMETRY: "Telemetry",
};

const formatConnectorName = (id) =>
  CONNECTOR_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1);

const formatRelative = (iso) => {
  if (!iso) return "N/A";
  const date = new Date(iso);
  return formatDistanceToNowStrict(date, { addSuffix: true });
};

const formatDate = (iso) => {
  if (!iso) return "N/A";
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return formatInTimeZone(new Date(iso), localTz, "Pp zzz");
};

const SyncCard = ({ connector, isAdmin, accountId, logs, onRefresh }) => {
  const [selectedRange, setSelectedRange] = useState("7d");
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [lastRowCount, setLastRowCount] = useState(null);
  const [lastErrorMessage, setLastErrorMessage] = useState(null);

  useEffect(() => {
    const latestSuccessful = logs
      ?.filter(
        (log) =>
          (log.status === "success" || log.status === "partial_success") &&
          log.completedAt
      )

      .sort(
        (a, b) =>
          new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      )[0];

    if (latestSuccessful) {
      setLastSyncTime(latestSuccessful.completedAt);
      setLastRowCount(latestSuccessful.rowCount ?? null);
      setLastErrorMessage(latestSuccessful.errorMessage ?? null);
    }
  }, [logs]);

  const handleManualSync = async () => {
    setIsLoading(true);

    const toastIds = {
      METADATA: toast.loading("Running Metadata sync..."),
      TELEMETRY: toast.loading("Running Telemetry sync..."),
    };

    try {
      const res = await fetch(`/api/connectors/sync/manual`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectorId: connector.connectorId,
          refreshWindow: selectedRange,
          accountId,
        }),
      });

      if (!res.ok) throw new Error("Sync failed");

      const {
        syncedAt,
        rowCount,
        errorMessage,
        errors = [],
      } = await res.json();
      setLastSyncTime(syncedAt);
      setLastRowCount(rowCount);
      setLastErrorMessage(errorMessage || null);

      const summaryErrors = aggregateErrors(errors);
      if (summaryErrors.length > 0) {
        toast.error(
          "⚠️ Sync completed with errors:\n" + summaryErrors.join("\n")
        );
      }

      Object.entries(toastIds).forEach(([script, id]) => {
        toast.success(`${SCRIPT_LABELS[script]} sync complete!`, { id });
      });

      if (errorMessage) {
        toast.error(`⚠️ ${errorMessage}`);
      }

      toast.success(
        `${formatConnectorName(connector.connectorId)} synced successfully!`
      );

      onRefresh(connector.connectorId);
    } catch (err) {
      console.error(err);

      Object.entries(toastIds).forEach(([script, id]) => {
        toast.error(`${SCRIPT_LABELS[script]} sync failed ❌`, { id });
      });

      toast.error("❌ Sync failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const aggregateErrors = (errors) => {
    const counts = {};
    for (const err of errors || []) {
      const msg = err.error || err.message || "Unknown error";
      counts[msg] = (counts[msg] || 0) + 1;
    }
    return Object.entries(counts).map(([msg, count]) => `${count}× ${msg}`);
  };

  return (
    <div className="connector-card">
      <h3>{formatConnectorName(connector.connectorId)}</h3>

      <div className="sync-controls">
        <label htmlFor={`range-${connector.connectorId}`}>Refresh Range</label>
        <select
          id={`range-${connector.connectorId}`}
          value={selectedRange}
          onChange={(e) => setSelectedRange(e.target.value)}
        >
          {REFRESH_OPTIONS.map(
            (opt) =>
              (!opt.adminOnly || isAdmin) && (
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

      <div className="sync-meta">
        <p>
          <strong>Last Sync:</strong>{" "}
          {lastSyncTime ? `${formatRelative(lastSyncTime)}` : "Never"}
        </p>
        <p>
          <strong>Rows Imported:</strong>{" "}
          {lastRowCount !== undefined && lastRowCount !== null
            ? lastRowCount
            : "N/A"}
        </p>

        {lastErrorMessage && (
          <p className="sync-warning">⚠️ {lastErrorMessage}</p>
        )}
      </div>

      <div className="sync-logs">
        <div className="sync-logs-header">
          <h4>Sync History</h4>
          <button
            onClick={() => onRefresh(connector.connectorId)}
            className="refresh-button"
          >
            Refresh Logs
          </button>
        </div>
        {!Array.isArray(logs) || logs.length === 0 ? (
          <p>No syncs yet.</p>
        ) : (
          <ul>
            {logs.map((log) => (
              <li key={log.id}>
                <div>
                  <strong>
                    {formatConnectorName(log.connectorId)}
                    {log.tableName ? ` (${log.tableName})` : ""}
                  </strong>
                </div>
                <div>
                  {formatRelative(log.createdAt)} →{" "}
                  {log.completedAt
                    ? formatRelative(log.completedAt)
                    : "in progress"}
                  <br />
                  <small>
                    ({formatDate(log.createdAt)} → {formatDate(log.completedAt)}
                    )
                  </small>
                </div>
                <div>
                  Status:{" "}
                  <span
                    className={`status-badge status-${(
                      log.status || "unknown"
                    ).toLowerCase()}`}
                  >
                    {log.status === "success" && log.errorMessage
                      ? "Partial Success"
                      : log.status || "Unknown"}
                  </span>
                  {log.durationSeconds !== null &&
                    log.durationSeconds !== undefined && (
                      <span className="duration">
                        {" "}
                        • {log.durationSeconds.toFixed(1)}s
                      </span>
                    )}
                </div>
                <div>
                  Rows:{" "}
                  {log.rowCount !== undefined && log.rowCount !== null
                    ? log.rowCount
                    : "?"}
                </div>
                {log.errorMessage && (
                  <div className="error-message">⚠️ {log.errorMessage}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const SyncManagementPage = () => {
  const [connectors, setConnectors] = useState([]);
  const [logsMap, setLogsMap] = useState({});
  const { user, authLoading } = useAuth();

  const fetchLogsForConnector = async (connectorId) => {
    try {
      const res = await fetch(
        `/api/connectors/sync/manual/logs?connectorId=${connectorId}&accountId=${user?.accountId}`,
        { method: "GET", credentials: "include" }
      );
      const data = await res.json();
      setLogsMap((prev) => ({
        ...prev,
        [connectorId]: data.logs || [],
      }));
    } catch (err) {
      console.warn(`Failed to fetch logs for ${connectorId}`, err);
    }
  };

  const fetchAllLogs = () => {
    connectors.forEach((c) => fetchLogsForConnector(c.connectorId));
  };

  useEffect(() => {
    const fetchConnectors = async () => {
      if (!user?.accountId) {
        console.error("Missing accountId in auth context");
        return;
      }

      try {
        const res = await fetch(
          `/api/connectors/configs?accountId=${user.accountId}`,
          { method: "GET", credentials: "include" }
        );

        if (!res.ok) throw new Error("Failed to fetch connectors");

        const data = await res.json();
        setConnectors(data.configs || []);
      } catch (err) {
        console.error("Error fetching connectors", err);
      }
    };

    if (!authLoading) fetchConnectors();
  }, [user, authLoading]);

  useEffect(() => {
    if (connectors.length > 0) {
      fetchAllLogs();
      const interval = setInterval(fetchAllLogs, 30000);
      return () => clearInterval(interval);
    }
  }, [connectors]);

  return (
    <div className="connector-page-container">
      <div className="connector-main-layout">
        <Toaster position="top-center" />
        <h1>Sync Management</h1>
        <p>Manually refresh connector data and view past activity.</p>
        <div className="connectors-grid">
          {connectors.map((connector) => (
            <SyncCard
              key={connector.connectorId}
              connector={connector}
              isAdmin={user?.role === "admin"}
              accountId={user?.accountId}
              logs={logsMap[connector.connectorId] || []}
              onRefresh={fetchLogsForConnector}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SyncManagementPage;
