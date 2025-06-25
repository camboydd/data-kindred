import React, { useEffect, useState } from "react";
import ConnectorListPanel from "../components/ConnectorListPanel";
import ConnectorDetails from "../components/ConnectorDetails";
import { useAuth } from "../context/AuthContext";
import "./SyncManagementPage.css";

const SyncManagementPage = () => {
  const [connectors, setConnectors] = useState([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState(null);
  const [logsMap, setLogsMap] = useState({});
  const { user, authLoading } = useAuth();

  const fetchLogsForConnector = async (connectorId) => {
    try {
      const res = await fetch(
        `/api/connectors/sync/manual/logs?connectorId=${connectorId}&accountId=${user?.accountId}`,
        { credentials: "include" }
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

  useEffect(() => {
    const fetchConnectors = async () => {
      if (!user?.accountId) return;
      try {
        const res = await fetch(
          `/api/connectors/configs?accountId=${user.accountId}`,
          { credentials: "include" }
        );
        const data = await res.json();
        setConnectors(data.configs || []);
        if (!selectedConnectorId && data.configs?.[0]) {
          setSelectedConnectorId(data.configs[0].connectorId);
        }
      } catch (err) {
        console.error("Failed to fetch connectors", err);
      }
    };

    if (!authLoading) fetchConnectors();
  }, [user, authLoading]);

  useEffect(() => {
    if (selectedConnectorId) fetchLogsForConnector(selectedConnectorId);
  }, [selectedConnectorId]);

  const selectedConnector = connectors.find(
    (c) => c.connectorId === selectedConnectorId
  );

  return (
    <div className="sync-page-layout">
      <ConnectorListPanel
        connectors={connectors}
        selectedId={selectedConnectorId}
        onSelect={setSelectedConnectorId}
        logsMap={logsMap}
      />
      <ConnectorDetails
        connector={selectedConnector}
        logs={logsMap[selectedConnectorId] || []}
        user={user}
        onRefreshLogs={fetchLogsForConnector}
      />
    </div>
  );
};

export default SyncManagementPage;
