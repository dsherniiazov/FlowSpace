import { useOutletContext } from "react-router-dom";

import { LessonWorkspace } from "../components/LessonWorkspace";
import { AppLayoutOutletContext } from "../layouts/AppLayout";

export function LessonsPage(): JSX.Element {
  const layoutContext = useOutletContext<AppLayoutOutletContext>();
  return <LessonWorkspace layoutContext={layoutContext} />;
}
