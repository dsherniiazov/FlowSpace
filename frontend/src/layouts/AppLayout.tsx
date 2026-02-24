import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useMatch, useNavigate } from "react-router-dom";
import { fetchLessons } from "../features/lessons/api";
import { fetchLessonTasks } from "../features/lessonTasks/api";
import { fetchSections } from "../features/sections/api";
import { fetchCompletedTasks } from "../features/taskProgress/api";
import { getAvatarUrl } from "../features/users/api";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { Lesson, LessonTask, Section, UserPublic } from "../types/api";

const navBase = "app-nav-link";
type ThemeMode = "light" | "dark";
export type AppLayoutOutletContext = {
  setLessonHeader: (value: string | null) => void;
};

export function AppLayout(): JSX.Element {
  const navigate = useNavigate();
  const clearSession = useAuthStore((state) => state.clearSession);
  const email = useAuthStore((state) => state.email);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const userId = useAuthStore((state) => state.userId);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lessonHeader, setLessonHeader] = useState<string | null>(null);
  const lessonFocusMatch = useMatch("/app/lessons/:lessonId");
  const isLessonFocusMode = Boolean(lessonFocusMatch);
  const currentLessonId = lessonFocusMatch?.params.lessonId ? Number(lessonFocusMatch.params.lessonId) : null;
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem("flowspace-theme");
    if (saved === "dark" || saved === "light") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("flowspace-theme", theme);
  }, [theme]);

  const lessonsQuery = useQuery({ queryKey: ["lessons"], queryFn: fetchLessons, enabled: isLessonFocusMode });
  const sectionsQuery = useQuery({ queryKey: ["sections"], queryFn: fetchSections, enabled: isLessonFocusMode });
  const tasksQuery = useQuery({ queryKey: ["lesson-tasks"], queryFn: () => fetchLessonTasks(), enabled: isLessonFocusMode });
  const completedTasksQuery = useQuery({ queryKey: ["completed-tasks"], queryFn: fetchCompletedTasks, enabled: isLessonFocusMode });
  const currentUserQuery = useQuery({
    queryKey: ["sidebar-user", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await api.get<UserPublic>(`/users/${userId}`);
      return data;
    },
    enabled: !!userId,
  });

  const lessons: Lesson[] = useMemo(
    () => [...(lessonsQuery.data ?? [])].sort((a, b) => Number(a.order_index ?? Number.MAX_SAFE_INTEGER) - Number(b.order_index ?? Number.MAX_SAFE_INTEGER)),
    [lessonsQuery.data],
  );
  const sections: Section[] = useMemo(
    () => [...(sectionsQuery.data ?? [])].sort((a, b) => Number(a.order_index ?? Number.MAX_SAFE_INTEGER) - Number(b.order_index ?? Number.MAX_SAFE_INTEGER)),
    [sectionsQuery.data],
  );
  const tasks: LessonTask[] = useMemo(
    () => [...(tasksQuery.data ?? [])].sort((a, b) => Number(a.order_index ?? Number.MAX_SAFE_INTEGER) - Number(b.order_index ?? Number.MAX_SAFE_INTEGER)),
    [tasksQuery.data],
  );
  const completedTaskSet = useMemo(
    () => new Set((completedTasksQuery.data ?? []).map((item) => item.task_id)),
    [completedTasksQuery.data],
  );
  const lessonsBySection = useMemo(() => {
    const grouped = new Map<number, Lesson[]>();
    for (const lesson of lessons) {
      if (lesson.section_id == null) continue;
      const list = grouped.get(lesson.section_id) ?? [];
      list.push(lesson);
      grouped.set(lesson.section_id, list);
    }
    return grouped;
  }, [lessons]);
  const tasksByLesson = useMemo(() => {
    const grouped = new Map<number, LessonTask[]>();
    for (const task of tasks) {
      const list = grouped.get(task.lesson_id) ?? [];
      list.push(task);
      grouped.set(task.lesson_id, list);
    }
    return grouped;
  }, [tasks]);
  const lessonCompletedMap = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const lesson of lessons) {
      const lessonTaskList = tasksByLesson.get(lesson.id) ?? [];
      map.set(
        lesson.id,
        lessonTaskList.length > 0 && lessonTaskList.every((task) => completedTaskSet.has(task.id)),
      );
    }
    return map;
  }, [lessons, tasksByLesson, completedTaskSet]);
  const visibleSections = useMemo(
    () => sections.filter((section) => (lessonsBySection.get(section.id) ?? []).length > 0),
    [sections, lessonsBySection],
  );
  const logoSrc = theme === "dark" ? "/images/flowspace_white.svg" : "/images/flowspace_black.svg";
  const sidebarAvatarUrl = getAvatarUrl(currentUserQuery.data?.avatar_path);
  const sidebarInitial = String(email ?? "U").slice(0, 1).toUpperCase();

  return (
    <div className={`app-shell ${sidebarCollapsed ? "is-collapsed" : ""}`}>
      <aside className="app-sidebar">
        <div className="app-sidebar-header">
          <button className="logo-btn" onClick={() => setSidebarCollapsed(true)}>
            <img src={logoSrc} alt="FlowSpace" className="app-brand-logo" />
          </button>
        </div>

        {isLessonFocusMode ? (
          <div className="app-sidebar-section lesson-focus-nav">
            <div className="app-sidebar-label">Learning</div>
            <button className="lesson-all-lessons-btn" onClick={() => navigate("/app/lessons")}>
              All lessons
            </button>
            {visibleSections.map((section) => (
              <div key={section.id} className="lesson-focus-section">
                <div className="lesson-focus-section-title">{section.title}</div>
                <div className="lesson-focus-lesson-list">
                  {(lessonsBySection.get(section.id) ?? []).map((lesson) => {
                    const completed = lessonCompletedMap.get(lesson.id) ?? false;
                    const active = currentLessonId === lesson.id;
                    return (
                      <button
                        key={lesson.id}
                        className={`lesson-focus-lesson-item ${active ? "active" : ""}`}
                        onClick={() => navigate(`/app/lessons/${lesson.id}`)}
                      >
                        <span className={`lesson-focus-dot ${completed ? "completed" : ""}`} />
                        <span>{lesson.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="app-sidebar-section">
            <div className="app-sidebar-label">Workspace</div>
            <nav className="app-nav">
              <NavLink className={({ isActive }) => `${navBase} ${isActive ? "active" : ""}`} to="/app/lessons">Lessons</NavLink>
              <NavLink className={({ isActive }) => `${navBase} ${isActive ? "active" : ""}`} to="/app/lab">Lab</NavLink>
              <NavLink className={({ isActive }) => `${navBase} ${isActive ? "active" : ""}`} to="/app/profile">Profile</NavLink>
              {isAdmin ? (
                <NavLink className={({ isActive }) => `${navBase} ${isActive ? "active" : ""}`} to="/app/control">Control</NavLink>
              ) : null}
            </nav>
          </div>
        )}

        <div className="app-sidebar-footer">
          <button className="user-chip" onClick={() => navigate("/app/profile")}>
            <div className="user-chip-avatar">
              {sidebarAvatarUrl ? <img src={sidebarAvatarUrl} alt="Profile avatar" className="h-full w-full rounded-[inherit] object-cover" /> : sidebarInitial}
            </div>
            <div className="user-chip-meta">
              <div className="user-chip-title">{isAdmin ? "Administrator" : "Student"}</div>
              <div className="user-chip-subtitle">{email}</div>
            </div>
          </button>
        </div>
      </aside>

      <div className="app-main">
        {!isLessonFocusMode ? (
          <header className="app-topbar">
            {sidebarCollapsed ? (
              <button className="app-topbar-logo" onClick={() => setSidebarCollapsed(false)} aria-label="Open sidebar">
                <img src={logoSrc} alt="FlowSpace" className="app-brand-logo" />
              </button>
            ) : (
              <div className="app-topbar-logo-spacer" aria-hidden="true" />
            )}
            {lessonHeader ? <div className="app-breadcrumbs">{lessonHeader}</div> : <div />}
            <div className="flex items-center gap-2">
              <button
                className="theme-toggle"
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
              >
                <span className="theme-toggle-icon" aria-hidden="true">
                  {theme === "dark" ? "☀" : "☾"}
                </span>
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  clearSession();
                  navigate("/");
                }}
              >
                Exit
              </button>
            </div>
          </header>
        ) : null}
        {isLessonFocusMode && sidebarCollapsed ? (
          <button className="lesson-focus-expand-btn" onClick={() => setSidebarCollapsed(false)}>
            FlowSpace
          </button>
        ) : null}
        <main className="app-content">
          <Outlet context={{ setLessonHeader }} />
        </main>
      </div>
    </div>
  );
}
