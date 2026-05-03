import { Link, useOutletContext, useSearchParams } from "react-router-dom";

import { LessonWorkspace } from "../components/LessonWorkspace";
import { AppLayoutOutletContext } from "../layouts/AppLayout";

export function LessonsPage(): JSX.Element {
  const layoutContext = useOutletContext<AppLayoutOutletContext>();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");
  const nextId = rawNext !== null && rawNext.length > 0 ? Number.parseInt(rawNext, 10) : NaN;
  const initialLessonId = Number.isFinite(nextId) ? nextId : null;

  return (
    <div className="lessons-page-stack">
      <LessonWorkspace layoutContext={layoutContext} initialLessonId={initialLessonId} />

      <section className="lessons-lab-cta" aria-label="Lab call to action">
        <h2 className="lessons-lab-cta-title">Explore power of system modeling now!</h2>
        <div className="lessons-lab-cta-action">
          <Link className="lessons-lab-cta-btn" to="/app/lab">
            Go to Lab
          </Link>
        </div>
      </section>
    </div>
  );
}
