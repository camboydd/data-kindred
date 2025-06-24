import React, { useEffect, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
} from "recharts";
import { Activity, TrendingUp, Wrench, HelpCircle } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";

import { useAuth } from "../context/AuthContext";
import "./DashboardPage.css";

const DashboardPage = () => {
  const alertRef = useRef(null);
  const [darkMode, setDarkMode] = useState(false);
  const [kpis, setKpis] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [recentJobs, setRecentJobs] = useState([]);
  const [hasSnowflakeConfig, setHasSnowflakeConfig] = useState(false);
  const [hasConnectorConfig, setHasConnectorConfig] = useState(false);
  const [setupComplete, setSetupComplete] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const { user, authLoading } = useAuth();

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (alertRef.current) {
        alertRef.current.scrollBy({ left: 200, behavior: "smooth" });
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const accountId = user.accountId;

        const [kpiRes, perfRes, recentRes, snowflakeRes, connectorRes] =
          await Promise.all([
            fetch("/api/etl/kpis", { credentials: "include" }),
            fetch("/api/etl/daily-volume", { credentials: "include" }),
            fetch("/api/etl/recent-activity", { credentials: "include" }),
            fetch("/api/snowflake/configs", { credentials: "include" }),
            fetch(`/api/connectors/configs?accountId=${accountId}`, {
              credentials: "include",
            }),
          ]);

        const [kpiData, perfData, recentData] = await Promise.all([
          kpiRes.json(),
          perfRes.json(),
          recentRes.json(),
        ]);
        setKpis(kpiData);

        const snowflakeConfigured =
          snowflakeRes.ok && (await snowflakeRes.json()).length > 0;
        setHasSnowflakeConfig(snowflakeConfigured);

        const connectorData = connectorRes.ok
          ? await connectorRes.json()
          : { configs: [] };
        const connectorConfigured = connectorData.configs?.some(
          (cfg) => Object.keys(cfg.credentials || {}).length > 0
        );
        setHasConnectorConfig(connectorConfigured);

        setSetupComplete(
          snowflakeConfigured &&
            connectorConfigured &&
            kpiData.successfulRuns > 0
        );

        const today = new Date();
        const paddedDays = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(today);
          d.setDate(d.getDate() - (6 - i));
          return d.toISOString().split("T")[0];
        });

        const volumeMap = new Map();
        perfData.forEach((row) => {
          volumeMap.set(row.date, row.totalRows);
        });

        const paddedData = paddedDays.map((date) => ({
          date,
          totalRows: volumeMap.get(date) ?? 0,
        }));
        setChartData(paddedData);

        const parseUTCStringToLocal = (utcStr) => {
          const [datePart, timePart] = utcStr.split(" ");
          const [year, month, day] = datePart.split("-").map(Number);
          const [hour, minute, second] = timePart.split(":").map(Number);
          const utcDate = new Date(
            Date.UTC(year, month - 1, day, hour, minute, second)
          );
          return utcDate.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
        };

        const localRecentJobs = recentData.map((job) => ({
          ...job,
          LOCAL_LAST_RUN: parseUTCStringToLocal(job.LAST_RUN),
        }));
        setRecentJobs(localRecentJobs);
        setIsLoading(false);
      } catch (err) {
        console.error("❌ Failed to load analytics:", err);
        setIsLoading(false);
        setSetupComplete(false);
      }
    };

    if (user) fetchAnalytics();
  }, [user]);

  if (authLoading) return null;
  if (!user) return <div>Please log in to view your dashboard.</div>;
  if (isLoading) {
    return (
      <div className="dashboard-fullscreen-spinner">
        <div className="spinner" />
        <span>Loading dashboard...</span>
      </div>
    );
  }

  return (
    <div className={`dashboard-app-container ${darkMode ? "dark-mode" : ""}`}>
      <div className="dashboard-main-layout">
        <div className="dashboard-content-area">
          {/* Welcome Section */}
          <div className="dashboard-welcome-intro">
            <div className="dashboard-welcome-left">
              <h2>Welcome!</h2>
              <p>
                Kindred connects your operational platforms directly to your{" "}
                <strong>Snowflake warehouse</strong>. It simplifies data
                integration so you can focus on insights, not pipelines.
              </p>
            </div>

            {/* Setup Progress */}
            <Tooltip.Provider>
              <div className="dashboard-setup-inline">
                <h4 className="setup-inline-heading">Setup Progress</h4>
                <div className="dashboard-setup-steps">
                  {[
                    {
                      label: "Snowflake connected",
                      tooltip:
                        "We found a valid Snowflake configuration for your account.",
                      isComplete: hasSnowflakeConfig,
                    },
                    {
                      label: "Connector saved",
                      tooltip:
                        "At least one connector has been saved with credentials.",
                      isComplete: hasConnectorConfig,
                    },
                    {
                      label: "Pipeline ran",
                      tooltip: "A pipeline has run successfully at least once.",
                      isComplete: kpis?.successfulRuns > 0,
                    },
                  ].map((step, idx) => (
                    <div className="dashboard-step-item" key={idx}>
                      <span
                        className={`connection-dot ${
                          step.isComplete ? "green" : "red"
                        }`}
                      />
                      <span style={{ display: "flex", alignItems: "center" }}>
                        {step.label}
                        <Tooltip.Root delayDuration={200}>
                          <Tooltip.Trigger asChild>
                            <HelpCircle className="step-help-icon" />
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              className="custom-tooltip"
                              sideOffset={5}
                            >
                              {step.tooltip}
                              <Tooltip.Arrow className="tooltip-arrow" />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Tooltip.Provider>
          </div>

          {/* KPI SECTION */}
          <div className="dashboard-section dashboard-key-metrics">
            <div className="dashboard-section-title">
              <Activity className="dashboard-section-icon" />
              <h3>ETL Pipeline Summary</h3>
            </div>

            <div className="dashboard-kpi-grid">
              <div className="dashboard-kpi-card">
                <h4 className="dashboard-kpi-title">Successful Runs</h4>
                <span className="dashboard-kpi-value">
                  {kpis.successfulRuns?.toLocaleString() ?? "–"}
                </span>
              </div>
              <div className="dashboard-kpi-card">
                <h4 className="dashboard-kpi-title">Total Rows Synced</h4>
                <span className="dashboard-kpi-value">
                  {kpis.totalRows?.toLocaleString() ?? "–"}
                </span>
              </div>
              <div className="dashboard-kpi-card">
                <h4 className="dashboard-kpi-title">Success Rate</h4>
                <span className="dashboard-kpi-value">
                  {kpis.successRate ?? "–"}%
                </span>
              </div>
              <div className="dashboard-kpi-card">
                <h4 className="dashboard-kpi-title">Active Integrations</h4>
                <span className="dashboard-kpi-value">
                  {kpis.activeIntegrations ?? "–"}
                </span>
              </div>
            </div>
          </div>

          {/* CHART & RECENT JOBS */}
          <div className="dashboard-section dashboard-chart-work-row">
            <div className="dashboard-chart-wrapper">
              <div className="dashboard-section-title">
                <TrendingUp className="dashboard-section-icon" />
                <h3>Daily Sync Volume</h3>
              </div>
              <div className="dashboard-chart-box dashboard-large-chart">
                <ResponsiveContainer width="100%" height={259}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient
                        id="rowVolumeGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#4f46e5"
                          stopOpacity={0.6}
                        />
                        <stop
                          offset="95%"
                          stopColor="#4f46e5"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tickFormatter={(str) => {
                        const [year, month, day] = str.split("-");
                        const d = new Date(year, month - 1, day);
                        return d.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        });
                      }}
                    />
                    <RechartTooltip
                      labelFormatter={(label) => {
                        const [year, month, day] = label.split("-");
                        const d = new Date(year, month - 1, day);
                        return d.toLocaleDateString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        });
                      }}
                      formatter={(value) => value.toLocaleString()}
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        borderColor: "#334155",
                        color: "#fff",
                        fontSize: "12px",
                        borderRadius: "6px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="totalRows"
                      stroke="#4f46e5"
                      strokeWidth={2}
                      fill="url(#rowVolumeGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="dashboard-recent-work-wrapper">
              <div className="dashboard-section-title">
                <Wrench className="dashboard-section-icon" />
                <h3>Recent Pipeline Activity</h3>
              </div>
              <div className="dashboard-recent-work-section">
                <div className="dashboard-recent-work-table">
                  {recentJobs.length === 0 ? (
                    <p className="dashboard-empty-state">
                      No recent jobs found.
                    </p>
                  ) : (
                    recentJobs.map((entry, index) => (
                      <div className="dashboard-recent-job-row" key={index}>
                        <div className="dashboard-recent-job-top">
                          <span className="dashboard-job-asset">
                            {entry.CONNECTOR_ID}
                          </span>
                          <span className="dashboard-job-date">
                            {entry.LOCAL_LAST_RUN}
                          </span>
                        </div>
                        <div className="dashboard-recent-job-bottom">
                          <span
                            className={`dashboard-job-message ${
                              entry.LAST_STATUS === "error"
                                ? "text-error"
                                : "text-success"
                            }`}
                          >
                            {entry.LAST_STATUS === "error"
                              ? `Failed: ${entry.LAST_ERROR ?? "No message"}`
                              : "Sync completed"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
