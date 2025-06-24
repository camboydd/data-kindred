import { Link } from "react-router-dom";
import "./Footer.css";

export default function Footer() {
  return (
    <footer className="homepage-footer">
      <p className="footer-text">
        © {new Date().getFullYear()} <strong>DataKindred</strong>. The easiest
        way to own your data.
      </p>
      <div className="footer-links">
        <Link to="/privacy-policy" className="footer-link">
          Privacy Policy
        </Link>
        <span className="footer-separator">|</span>
        <Link to="/cookie-policy" className="footer-link">
          Cookie Policy
        </Link>
        <span className="footer-separator">|</span>
        <Link to="/terms" className="footer-link">
          Terms & Conditions
        </Link>
        <span className="footer-separator">|</span>
        <a
          href="#"
          className="termly-display-preferences footer-link"
          onClick={(e) => e.preventDefault()}
        >
          Consent Preferences
        </a>
      </div>
    </footer>
  );
}
