import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "./StartCheckout.css";

const planMap = {
  [process.env.REACT_APP_PRICE_ID_BASIC]: "Basic",
  [process.env.REACT_APP_PRICE_ID_PRO]: "Pro",
};

const StartCheckout = () => {
  const [searchParams] = useSearchParams();
  const priceId = searchParams.get("priceId");
  const navigate = useNavigate();

  const planName = planMap[priceId] || "your selected";

  useEffect(() => {
    if (!priceId) return;

    // Redirect to backend for Stripe Checkout session
    const createCheckout = async () => {
      try {
        const res = await fetch("/api/users/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ priceId }),
        });

        const data = await res.json();
        if (res.ok && data.url) {
          window.location.href = data.url;
        } else {
          navigate("/pricing?checkout=fail");
        }
      } catch (err) {
        console.error("Checkout error:", err);
        navigate("/pricing?checkout=fail");
      }
    };

    createCheckout();
  }, [priceId, navigate]);

  return (
    <div className="start-checkout-wrapper">
      <div className="checkout-card">
        <h2>Redirecting to Stripe...</h2>
        <p>
          You’ve selected the <strong>{planName}</strong> plan.
        </p>
        <div className="checkout-spinner" />
        <p>This may take a moment. Please don’t close this window.</p>
      </div>
    </div>
  );
};

export default StartCheckout;
