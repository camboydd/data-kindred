import React, { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { Plug } from "lucide-react";
import "./AuditLogsPage.css";
import { authFetch } from "../util/authFetch";

const AuditLogsPage = () => {
  const [rawLogs, setRawLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [filters, setFilters] = useState({
    actorEmail: "",
    action: "",
    status: "",
    startDate: "",
    endDate: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAuditLogsForUser = async () => {
      setLoading(true);
      try {
        const res = await authFetch("/api/audit", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error(`Failed with status ${res.status}`);
        }

        const data = await res.json();
        setRawLogs(data);
        setFilteredLogs(data); // initial filtered set = all logs
      } catch (err) {
        console.error("❌ Failed to fetch audit logs:", err);
      } finally {
        setLoading(false);
      }
    };

    // Fetch logs scoped to user based on role (handled by backend)
    fetchAuditLogsForUser();
  }, []);

  useEffect(() => {
    const applyFilters = () => {
      const { actorEmail, action, status, startDate, endDate } = filters;

      const filtered = rawLogs.filter((log) => {
        const ts = new Date(log.TIMESTAMP);

        return (
          (!actorEmail ||
            log.ACTOR_EMAIL.toLowerCase().includes(actorEmail.toLowerCase())) &&
          (!action ||
            log.ACTION.toLowerCase().includes(action.toLowerCase())) &&
          (!status || log.STATUS.toLowerCase() === status.toLowerCase()) &&
          (!startDate || ts >= new Date(startDate)) &&
          (!endDate || ts <= new Date(`${endDate}T23:59:59`))
        );
      });

      setFilteredLogs(filtered);
    };

    applyFilters();
  }, [filters, rawLogs]);

  const handleChange = (e) => {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div className="audit-logs-container">
      <Navbar />
      <div className="audit-logs-content">
        <div className="dashboard-section-title">
          <Plug className="section-icon" />
          <h3>Audit Logs</h3>
        </div>
        <p className="connectors-subtitle">
          View user actions, system events, and platform-level audit trails.
        </p>

        <div className="filters simple-filters">
          <input
            name="actorEmail"
            placeholder="Filter by user email"
            value={filters.actorEmail}
            onChange={handleChange}
          />
          <input
            name="action"
            placeholder="Action keyword (e.g. updated_config)"
            value={filters.action}
            onChange={handleChange}
          />
          <select name="status" value={filters.status} onChange={handleChange}>
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="fail">Failure</option>
          </select>
          <input
            type="date"
            name="startDate"
            value={filters.startDate}
            onChange={handleChange}
          />
          <input
            type="date"
            name="endDate"
            value={filters.endDate}
            onChange={handleChange}
          />
        </div>

        {loading ? (
          <div className="spinner" />
        ) : (
          <table className="audit-log-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.ID}>
                  <td>{new Date(log.TIMESTAMP).toLocaleString()}</td>
                  <td>{log.ACTOR_EMAIL}</td>
                  <td>{log.ACTION}</td>
                  <td>
                    <span className={`status-pill ${log.STATUS.toLowerCase()}`}>
                      {log.STATUS}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan="4" className="no-results">
                    No matching logs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AuditLogsPage;
