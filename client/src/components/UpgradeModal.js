import React from "react";
import "./UpgradeModal.css"; // Optional, for scoped styles

const UpgradeModal = ({ planName, onClose }) => {
  const handleUpgrade = () => {
    window.location.href = "https://app.datakindred.com/upgrade?plan=pro";
  };

  return (
    <div className="modal-overlay">
      <div className="upgrade-modal">
        <h2>Connector Limit Reached</h2>
        <p>
          You've reached the maximum number of connectors allowed on your{" "}
          <strong>{planName}</strong> plan.
        </p>
        <p>Upgrade your plan to add more connectors.</p>
        <div className="modal-buttons">
          <button className="modal-upgrade-button" onClick={handleUpgrade}>
            Upgrade Plan
          </button>
          <button className="modal-cancel-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
