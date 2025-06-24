import { useEffect } from "react";

export default function TermsPage() {
  useEffect(() => {
    const scriptId = "termly-jssdk";

    // Remove and re-inject to ensure it works when navigating between routes
    const existingScript = document.getElementById(scriptId);
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://app.termly.io/embed-policy.min.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      const cleanup = document.getElementById(scriptId);
      if (cleanup) cleanup.remove();
    };
  }, []);

  return (
    <div
      style={{
        margin: "2rem",
        padding: "1rem",
      }}
    >
      <div name="termly-embed" data-id="5c40cccb-5aa3-4640-87db-f10b21b99b4f" />
    </div>
  );
}
