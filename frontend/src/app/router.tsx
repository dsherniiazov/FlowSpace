import { Navigate, createBrowserRouter } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { ControlPage } from "../pages/ControlPage";
import { ControlLessonsPage } from "../pages/ControlLessonsPage";
import { ControlUsersPage } from "../pages/ControlUsersPage";
import { PendingReviewPage } from "../pages/PendingReviewPage";
import { LandingPage } from "../pages/LandingPage";
import { LabPage } from "../pages/lab";
import { LessonDetailPage } from "../pages/LessonDetailPage";
import { LessonsPage } from "../pages/LessonsPage";
import { LoginPage } from "../pages/LoginPage";
import { OAuthCallbackPage } from "../pages/OAuthCallbackPage";
import { ProfilePage } from "../pages/ProfilePage";
import { RegisterPage } from "../pages/RegisterPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TaskExecutionPage } from "../pages/TaskExecutionPage";
import { useAuthStore } from "../store/authStore";

function Protected({ children }: { children: JSX.Element }): JSX.Element {
  const token = useAuthStore((state) => state.token);
  if (!token) return <Navigate to="/auth/login" replace />;
  return children;
}

function AdminOnly({ children }: { children: JSX.Element }): JSX.Element {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  if (!isAdmin) return <Navigate to="/app" replace />;
  return children;
}

export const appRouter = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/auth/login", element: <LoginPage /> },
  { path: "/auth/register", element: <RegisterPage /> },
  { path: "/auth/oauth/callback", element: <OAuthCallbackPage /> },
  {
    path: "/app",
    element: (
      <Protected>
        <AppLayout />
      </Protected>
    ),
    children: [
      { index: true, element: <Navigate to="lessons" replace /> },
      { path: "lessons", element: <LessonsPage /> },
      { path: "lessons/:lessonId", element: <LessonDetailPage /> },
      { path: "tasks/:taskId", element: <TaskExecutionPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "lab", element: <LabPage /> },
      { path: "my-systems", element: <Navigate to="/app/profile" replace /> },
      {
        path: "pending-review",
        element: (
          <AdminOnly>
            <PendingReviewPage />
          </AdminOnly>
        ),
      },
      {
        path: "control",
        element: (
          <AdminOnly>
            <ControlPage />
          </AdminOnly>
        ),
        children: [
          { index: true, element: <Navigate to="lessons" replace /> },
          { path: "lessons", element: <ControlLessonsPage /> },
          { path: "users", element: <ControlUsersPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
