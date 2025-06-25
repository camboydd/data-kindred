import React from "react";
import "./SyncManagementPage.css";

const formatStatus = (logs) => {
  if (!logs?.length) return "unknown";
  const latest = logs[0];
  if (latest.status === "success" && !latest.errorMessage) return "success";
  if (latest.status === "partial_success") return "partial";
  if (latest.status === "error") return "error";
  return "pending";
};

const ConnectorListPanel = ({ connectors, selectedId, onSelect, logsMap }) => {
  return (
    <div className="connector-list-panel">
      <h2>Connectors</h2>
      <ul>
        {connectors.map((conn) => {
          const status = formatStatus(logsMap[conn.connectorId]);
          return (
            <li
              key={conn.connectorId}
              className={`connector-list-item ${
                selectedId === conn.connectorId ? "selected" : ""
              }`}
              onClick={() => onSelect(conn.connectorId)}
            >
              <span>{conn.connectorId}</span>
              <span className={`status-dot ${status}`}></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ConnectorListPanel;
