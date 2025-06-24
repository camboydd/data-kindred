import { useEffect } from "react";

export default function PrivacyPolicyPage() {
  useEffect(() => {
    const scriptId = "termly-jssdk";

    // Remove existing script if it's already there (helps when navigating back and forth)
    const existing = document.getElementById(scriptId);
    if (existing) {
      existing.remove();
    }

    // Inject Termly embed script
    const js = document.createElement("script");
    js.id = scriptId;
    js.src = "https://app.termly.io/embed-policy.min.js";
    js.async = true;
    document.body.appendChild(js);

    return () => {
      // Clean up if user navigates away
      const cleanup = document.getElementById(scriptId);
      if (cleanup) cleanup.remove();
    };
  }, []);

  return (
    <div style={{ margin: "2rem", padding: "1rem" }}>
      <div name="termly-embed" data-id="a8182d69-a57b-48a8-9899-952b862bf679" />
    </div>
  );
}
