import { useRef, useState } from "react";
import { createPortal } from "react-dom";

const BUBBLE_W = 234;
const MARGIN = 8;

export function HelpTip({ text }: { text: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  function show() {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const idealLeft = rect.left + rect.width / 2;
      const clampedLeft = Math.min(
        Math.max(idealLeft, MARGIN + BUBBLE_W / 2),
        window.innerWidth - MARGIN - BUBBLE_W / 2,
      );
      setPos({ top: rect.top - 8, left: clampedLeft });
    }
    setOpen(true);
  }

  return (
    <span
      ref={ref}
      className="lab-help-dot"
      style={{ cursor: "help", flexShrink: 0 }}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      role="button"
      aria-label="Help"
    >
      ?
      {open && createPortal(
        <span
          className="lab-help-bubble"
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, -100%)" }}
        >
          {text}
        </span>,
        document.body,
      )}
    </span>
  );
}
