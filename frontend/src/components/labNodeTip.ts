export function labNodeTipProps(tip: string): { className: string; "data-student-tip": string | undefined } {
  const t = tip.trim();
  return {
    className: t ? "lab-node--tipped" : "",
    "data-student-tip": t || undefined,
  };
}
