import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plug } from "lucide-react";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { PLAN_RULES } from "../util/plan-config";
import UpgradeModal from "../components/UpgradeModal";
import { authFetch } from "../util/authFetch";

import sageIntacctLogo from "../assets/logos/sage-intacct.png";
import energycapLogo from "../assets/logos/ecap.png";
import serviceTitanLogo from "../assets/logos/servicetitan.png";
import clockworksLogo from "../assets/logos/clockworks.png";
import nClarityLogo from "../assets/logos/nclarity.png";

import "./ConnectorsPage.css";

const staticConnectors = [
  {
    id: "sageintacct",
    name: "Sage Intacct",
    description: "Integrate financial reports, general ledger, and dimensions.",
    logo: sageIntacctLogo,
  },
  {
    id: "energycap",
    name: "EnergyCAP",
    description:
      "Stream utility bills, benchmarking, and energy data to Snowflake.",
    logo: energycapLogo,
  },
  {
    id: "servicetitan",
    name: "ServiceTitan",
    description:
      "Connect job management, dispatch, and revenue reporting tools.",
    logo: serviceTitanLogo,
  },
  {
    id: "nclarity",
    name: "nClarity",
    description: "Integrate live telemetry and anomaly detection data.",
    logo: nClarityLogo,
  },
  {
    id: "clockworks",
    name: "Clockworks Analytics",
    description: "Stream FDD insights and equipment diagnostics to Snowflake.",
    logo: clockworksLogo,
  },
];

const ConnectorsPage = () => {
  const navigate = useNavigate();
  const { user, authLoading } = useAuth();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const [statusMap, setStatusMap] = useState(() =>
    staticConnectors.reduce((acc, cur) => {
      acc[cur.id] = "loading";
      return acc;
    }, {})
  );
  const [loading, setLoading] = useState(true);

  const connectedCount = Object.values(statusMap).filter(
    (status) => status === "connected"
  ).length;

  const planLimit =
    user?.plan && PLAN_RULES[user.plan]?.maxConnectors !== Infinity
      ? PLAN_RULES[user.plan].maxConnectors
      : null;

  useEffect(() => {
    const fetchStatuses = async () => {
      if (!user || !user.accountId) {
        console.error("🚫 Missing user or accountId from AuthContext");
        setLoading(false);
        return;
      }

      try {
        const res = await authFetch(
          `/api/connectors/statuses?accountId=${user.accountId}`,
          {
            method: "GET",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!res.ok) {
          console.error(`❌ Failed to fetch statuses: ${res.status}`);
          setLoading(false);
          return;
        }

        const data = await res.json();
        const updated = {};
        staticConnectors.forEach((c) => {
          updated[c.id] = data[c.id] || "not_configured";
        });
        setStatusMap(updated);
      } catch (err) {
        console.error("Error fetching connector statuses:", err);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) fetchStatuses();
  }, [user, authLoading]);

  const handleSetup = (id, name) => {
    if (
      planLimit !== null &&
      statusMap[id] !== "connected" &&
      connectedCount >= planLimit
    ) {
      setShowUpgradeModal(true);
      return;
    }

    navigate(`/connectors/${id}/setup`, { state: { name } });
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "connected":
        return "Connected";
      case "not_configured":
        return "Not Configured";
      case "invalid_credentials":
        return "Invalid Credentials";
      case "decryption_failed":
        return "Decryption Error";
      case "not_connected":
        return "Not Connected";
      case "fetch_failed":
        return "Fetch Failed";
      case "unknown_connector":
        return "Unknown Connector";
      default:
        return "Unknown";
    }
  };

  return (
    <div className="connector-page-container">
      <Navbar />
      <div className="connector-main-layout">
        {planLimit !== null && (
          <div className="connector-count-absolute">
            {connectedCount} / {planLimit}
          </div>
        )}

        <div className="dashboard-section-title">
          <Plug className="section-icon" />
          <h3>Connectors</h3>
        </div>

        <p className="connectors-subtitle">
          Choose a platform to begin integration with your Snowflake warehouse.
        </p>

        <div className="connectors-grid">
          {staticConnectors.map((connector) => (
            <div className="connector-card" key={connector.id}>
              <div className="connector-logo-wrapper">
                <img
                  src={connector.logo}
                  alt={`${connector.name} logo`}
                  className="connector-logo"
                />
              </div>
              <h3>{connector.name}</h3>
              <p>{connector.description}</p>
              {loading ? (
                <div className="status-spinner" />
              ) : (
                <span className={`status-badge ${statusMap[connector.id]}`}>
                  {getStatusLabel(statusMap[connector.id])}
                </span>
              )}
              <button
                className="setup-button"
                onClick={() => handleSetup(connector.id, connector.name)}
                disabled={loading}
              >
                {statusMap[connector.id] === "connected" ? "View" : "Set Up"}
              </button>
            </div>
          ))}
        </div>
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

export default ConnectorsPage;
