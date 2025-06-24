import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import inviteGraphic from "../assets/images/etl.png";

import AOS from "aos";
import "aos/dist/aos.css";
import "./RequestAccessPage.css";
import kindredLogo from "../assets/images/kindred.png"; // adjust path if needed

const RequestAccessPage = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const isOnRequestPage = location.pathname === "/request-access";

  useEffect(() => {
    AOS.init({ duration: 800, once: true });
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("/api/users/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to request access.");
      setSubmitted(true);
    } catch (err) {
      setError(
        "There was a problem submitting your request. Please try again."
      );
    }
  };

  return (
    <div className="request-homepage-container">
      <header className="webpage-navbar" data-aos="fade-down">
        <div className="navbar-content">
          <div className="navbar-logo">
            <img
              src={kindredLogo}
              alt="Kindred Logo"
              className="kindred-logo-icon"
            />
            <span>Kindred</span>
          </div>

          <button
            className="nav-toggle-button"
            onClick={() => navigate(isOnRequestPage ? "/" : "/request-access")}
          >
            {isOnRequestPage ? "Back to Home" : "Request Access"}
          </button>
        </div>
      </header>

      <main className="homepage-main">
        {/* HERO */}
        <section className="hero-section" data-aos="fade-up">
          <div className="hero-bg floating-bg" />
          <h1 className="hero-title">
            Join the Future of Data Integration.
            <br />
            <span className="hero-outline">Request Early Access</span>
          </h1>
          <p className="hero-subtitle">
            We’re currently invite-only. Submit your details below and we’ll get
            you started with secure, real-time pipelines — without vendor
            lock-in or data silos.
          </p>
        </section>

        {/* FORM */}
        <section className="request-form-section" data-aos="fade-up">
          <div className="form-grid">
            <div className="form-left">
              <div className="access-form-wrapper">
                {submitted ? (
                  <div className="success-message">
                    ✅ Request received! Check your email for your invite link.
                  </div>
                ) : (
                  <form className="access-form" onSubmit={handleSubmit}>
                    <input
                      type="text"
                      name="name"
                      placeholder="Your Name"
                      onChange={handleChange}
                      required
                    />
                    <input
                      type="email"
                      name="email"
                      placeholder="Your Work Email"
                      onChange={handleChange}
                      required
                    />
                    <input
                      type="text"
                      name="company"
                      placeholder="Company Name"
                      onChange={handleChange}
                      required
                    />
                    <button type="submit" className="btn-primary">
                      Request Invite
                    </button>
                    {error && <p className="error-message">{error}</p>}
                  </form>
                )}
              </div>
            </div>
            <div className="form-right">
              <img
                src={inviteGraphic}
                alt="Illustration of secure data flow"
                className="form-image"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="homepage-footer">
        <p>
          © {new Date().getFullYear()} Kindred Data. The power to unify. The
          freedom to own.
        </p>
      </footer>
    </div>
  );
};

export default RequestAccessPage;
