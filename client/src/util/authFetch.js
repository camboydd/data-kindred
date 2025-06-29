// utils/authFetch.js
export const authFetch = async (url, options = {}, navigate) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include", // important for cookies (JWT)
  });

  if (res.status === 401) {
    const next = encodeURIComponent(
      window.location.pathname + window.location.search
    );
    navigate(`/login?next=${next}`, { replace: true });
    return null;
  }

  return res;
};
