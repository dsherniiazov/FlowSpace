import { NavLink, Outlet } from "react-router-dom";

export function ControlPage(): JSX.Element {
  return (
    <section className="control-page space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-medium">Control</h2>
        <div className="flex gap-2">
          <NavLink
            to="/app/control/lessons"
            className={({ isActive }) => `btn-secondary ${isActive ? "control-tab-active" : ""}`}
          >
            Lessons
          </NavLink>
          <NavLink
            to="/app/control/users"
            className={({ isActive }) => `btn-secondary ${isActive ? "control-tab-active" : ""}`}
          >
            Users
          </NavLink>
        </div>
      </div>
      <Outlet />
    </section>
  );
}
