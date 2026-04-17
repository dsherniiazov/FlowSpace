import { useLocation } from "react-router-dom";

export function PageTransition({ children }: { children: React.ReactNode }): JSX.Element {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="page-enter" style={{ minHeight: "100%" }}>
      {children}
    </div>
  );
}
