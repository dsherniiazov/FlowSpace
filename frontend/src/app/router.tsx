import { Navigate, createBrowserRouter } from "react-router-dom";

import { AppLayout } from "../layouts/AppLayout";
import { ControlLessonsPage } from "../pages/ControlLessonsPage";
import { ControlEmailPage } from "../pages/ControlEmailPage";
import { ControlOAuthPage } from "../pages/ControlOAuthPage";
import { ControlPage } from "../pages/ControlPage";
import { ControlUsersPage } from "../pages/ControlUsersPage";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { LandingPage } from "../pages/LandingPage";
import { LabPage } from "../pages/lab";
import { LessonFullReadPage } from "../pages/LessonFullReadPage";
import { LessonsPage } from "../pages/LessonsPage";
import { LoginPage } from "../pages/LoginPage";
import { OAuthCallbackPage, OAuthProviderCallbackPage } from "../pages/OAuthCallbackPage";
import { PendingReviewPage } from "../pages/PendingReviewPage";
import { ProfilePage } from "../pages/ProfilePage";
import { RegisterPage } from "../pages/RegisterPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";
import { SettingsPage } from "../pages/SettingsPage";
import { TaskExecutionPage } from "../pages/TaskExecutionPage";
import { AdminOnly, Protected } from "./routeGuards";

export const appRouter = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/auth/login", element: <LoginPage /> },
  { path: "/auth/register", element: <RegisterPage /> },
  { path: "/auth/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/auth/reset-password", element: <ResetPasswordPage /> },
  { path: "/auth/oauth/:provider/callback", element: <OAuthProviderCallbackPage /> },
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
      { path: "lessons/:lessonId/read", element: <LessonFullReadPage /> },
      { path: "lessons/:lessonId", element: <LessonFullReadPage /> },
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
          { path: "email", element: <ControlEmailPage /> },
          { path: "oauth", element: <ControlOAuthPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
