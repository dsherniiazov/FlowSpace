import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { appRouter } from "./app/router";
import { applyUiPreferencesToDocument, getStoredUiPreferences } from "./store/uiPreferencesStore";
import "./styles.css";
import "./styles/base.css";
import "./styles/lab-editor.css";
import "./styles/theme.css";
import "./styles/landing.css";
import "./styles/settings-accessibility.css";
import "./styles/comments.css";
import "./styles/tutorial.css";

applyUiPreferencesToDocument(getStoredUiPreferences());

const savedTheme = localStorage.getItem("flowspace-theme");
const initialTheme =
  savedTheme === "dark" || savedTheme === "light"
    ? savedTheme
    : "light";
document.documentElement.setAttribute("data-theme", initialTheme);
document.documentElement.style.colorScheme = initialTheme;

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  </StrictMode>,
);
