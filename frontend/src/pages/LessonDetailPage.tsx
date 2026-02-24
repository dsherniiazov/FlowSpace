import { useMemo } from "react";
import { useOutletContext, useParams } from "react-router-dom";

import { LessonWorkspace } from "../components/LessonWorkspace";
import { AppLayoutOutletContext } from "../layouts/AppLayout";

export function LessonDetailPage(): JSX.Element {
  const { lessonId } = useParams();
  const layoutContext = useOutletContext<AppLayoutOutletContext>();
  const parsedId = useMemo(() => (lessonId ? Number(lessonId) : null), [lessonId]);

  return <LessonWorkspace layoutContext={layoutContext} initialLessonId={parsedId} fullPage />;
}
