import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({
  children,
}: {
  children: JSX.Element;
}) {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/me", { credentials: "include" });
        setAuthed(res.ok);
      } catch (e) {
        setAuthed(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;
  if (!authed) return <Navigate to="/admin/auth" replace />;
  return children;
}
