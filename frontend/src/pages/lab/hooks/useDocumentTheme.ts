import { useEffect, useState } from "react";

export function useDocumentTheme(): { isLightTheme: boolean } {
  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.dataset.theme === "light";
  });

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const syncTheme = () => setIsLightTheme(root.dataset.theme === "light");

    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

    return () => observer.disconnect();
  }, []);

  return { isLightTheme };
}
