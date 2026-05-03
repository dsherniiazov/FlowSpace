import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

export function PageTransition({ children }: { children: ReactNode }): JSX.Element {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-enter" style={{ minHeight: "100%" }}>
      {children}
    </div>
  );
}
