import { useEffect, useMemo, useRef, useState } from "react";
import {
  ConceptSearchHit,
  SYSTEMS_CONCEPTS,
  SystemsConcept,
  searchConcepts,
} from "../data/systemsConcepts";

type LabHelpModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

function conceptElementId(id: string): string {
  return `systems-concept-${id}`;
}

export function LabHelpModal({ isOpen, onClose }: LabHelpModalProps): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setActiveId(null);
      return;
    }
    const id = window.setTimeout(() => searchInputRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isOpen, onClose]);

  const suggestions: ConceptSearchHit[] = useMemo(() => searchConcepts(query, 4), [query]);

  function scrollToConcept(concept: SystemsConcept): void {
    setActiveId(concept.id);
    const node = document.getElementById(conceptElementId(concept.id));
    if (node && scrollRef.current) {
      const container = scrollRef.current;
      const top = node.offsetTop - container.offsetTop - 12;
      container.scrollTo({ top, behavior: "smooth" });
      window.setTimeout(() => setActiveId((prev) => (prev === concept.id ? null : prev)), 2200);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="lab-modal-overlay lab-help-overlay" onClick={onClose}>
      <div
        className="lab-help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="lab-help-head">
          <div>
            <h3 id="lab-help-title" className="lab-help-title">Systems thinking — quick reference</h3>
            <p className="lab-help-subtitle">
              Core ideas from Donella Meadows, <em>Thinking in Systems</em>. Search or scroll.
            </p>
          </div>
          <button
            type="button"
            className="lab-help-close"
            aria-label="Close help"
            onClick={onClose}
          >
            ✕
          </button>
        </header>

        <div className="lab-help-search-wrap">
          <input
            ref={searchInputRef}
            type="search"
            className="lab-help-search"
            placeholder="Search concepts (e.g. feedback, delay, leverage)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search systems concepts"
          />
          {query.trim() && suggestions.length > 0 ? (
            <ul className="lab-help-suggestions" role="listbox">
              {suggestions.map((hit) => (
                <li key={hit.concept.id}>
                  <button
                    type="button"
                    className="lab-help-suggestion"
                    onClick={() => {
                      scrollToConcept(hit.concept);
                      setQuery("");
                    }}
                  >
                    <span className="lab-help-suggestion-title">{hit.concept.title}</span>
                    <span className="lab-help-suggestion-sub">{hit.concept.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {query.trim() && suggestions.length === 0 ? (
            <div className="lab-help-suggestions lab-help-suggestions-empty">
              No matches. Try “feedback”, “stock”, “delay”, or “leverage”.
            </div>
          ) : null}
        </div>

        <div className="lab-help-body" ref={scrollRef}>
          {SYSTEMS_CONCEPTS.map((concept) => (
            <article
              id={conceptElementId(concept.id)}
              key={concept.id}
              className={`lab-help-card ${activeId === concept.id ? "is-active" : ""}`}
            >
              <h4 className="lab-help-card-title">{concept.title}</h4>
              <p className="lab-help-card-summary">{concept.summary}</p>
              {concept.body.map((paragraph, index) => (
                <p key={index} className="lab-help-card-paragraph">
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </div>

        <footer className="lab-help-foot">
          Source: Donella H. Meadows, <em>Thinking in Systems: A Primer</em> (Chelsea Green, 2008). Paraphrased.
        </footer>
      </div>
    </div>
  );
}
