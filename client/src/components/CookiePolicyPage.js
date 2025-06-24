import { useEffect } from "react";

export default function CookiePolicyPage() {
  useEffect(() => {
    // Try to reinitialize Termly's embed manually
    const script = document.createElement("script");
    script.src = "https://app.termly.io/embed-policy.min.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div style={{ margin: "2rem", padding: "1rem" }}>
      <div
        name="termly-embed"
        data-id="5420fdac-e5ad-4dd4-a8c0-d1b97f597c4a"
      ></div>
    </div>
  );
}
