import { Navigate } from "react-router-dom";

import { useAuthStore } from "../store/authStore";

type GuardProps = { children: JSX.Element };

export function Protected({ children }: GuardProps): JSX.Element {
  const token = useAuthStore((state) => state.token);
  if (!token) return <Navigate to="/auth/login" replace />;
  return children;
}

export function AdminOnly({ children }: GuardProps): JSX.Element {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  if (!isAdmin) return <Navigate to="/app" replace />;
  return children;
}
