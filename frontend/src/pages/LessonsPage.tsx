import { useOutletContext, useSearchParams } from "react-router-dom";

import { LessonWorkspace } from "../components/LessonWorkspace";
import { AppLayoutOutletContext } from "../layouts/AppLayout";

export function LessonsPage(): JSX.Element {
  const layoutContext = useOutletContext<AppLayoutOutletContext>();
  // Allow callers (e.g. finishing a lesson in the lab) to pre-select a specific
  // lesson by passing `?next=<lessonId>`; otherwise the workspace default applies.
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");
  const nextId = rawNext !== null && rawNext.length > 0 ? Number.parseInt(rawNext, 10) : NaN;
  const initialLessonId = Number.isFinite(nextId) ? nextId : null;
  return <LessonWorkspace layoutContext={layoutContext} initialLessonId={initialLessonId} />;
}
