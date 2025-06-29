import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import kindredLogo from "../assets/images/kindred_purple.png";
import { CheckCircle } from "lucide-react"; // Assuming you're using Lucide or can swap

import "./CheckoutSuccessPage.css"; // Optional: extract styles

const CheckoutSuccessPage = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/");
    }, 4000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="checkout-success-container">
      <div className="success-card">
        <img src={kindredLogo} alt="Kindred Logo" className="success-logo" />
        <CheckCircle size={64} color="#10b981" strokeWidth={1.5} />
        <h1 className="success-title">Payment Successful</h1>
        <p className="success-text">
          Your Kindred account is now active. Redirecting you to login...
        </p>
      </div>
    </div>
  );
};

export default CheckoutSuccessPage;
