import { memo, useEffect, useMemo, useRef, useState } from "react";
import { EdgeProps, getBezierPath, EdgeLabelRenderer } from "reactflow";

const PARTICLE_COUNT = 4;
const DURATION_S = 2.2;
const PARTICLE_DURATION = `${DURATION_S}s`;
const DRAIN_MS = DURATION_S * 1000;

function AnimatedParticleEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  data,
}: EdgeProps): JSX.Element {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // Fall back to the colorblind-aware neutral edge CSS variable instead of a
  // hardcoded gray so particles on edges without an explicit stroke still
  // respect the selected colorblind palette.
  const strokeColor = (style?.stroke as string) ?? "var(--lab-edge-neutral, #6b7280)";

  const animate = Boolean(data?.animate);
  const kind: string = (data?.kind as string) ?? "neutral";
  const isSquare = kind !== "inflow" && kind !== "outflow";

  /* ── Drain: when animate turns off, fade out over one cycle ── */
  const [visible, setVisible] = useState(false);
  const [draining, setDraining] = useState(false);
  const drainTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAnimate = useRef(false);

  useEffect(() => {
    const wasOn = prevAnimate.current;
    prevAnimate.current = animate;

    if (animate && !wasOn) {
      // turned ON → show immediately, cancel any pending drain
      if (drainTimer.current) { clearTimeout(drainTimer.current); drainTimer.current = null; }
      setDraining(false);
      setVisible(true);
    } else if (!animate && wasOn) {
      // turned OFF → start draining (fade out, then hide)
      setDraining(true);
      drainTimer.current = setTimeout(() => {
        setVisible(false);
        setDraining(false);
        drainTimer.current = null;
      }, DRAIN_MS);
    }
  }, [animate]);

  useEffect(() => () => { if (drainTimer.current) clearTimeout(drainTimer.current); }, []);

  const particles = useMemo(() => {
    const items: Array<{ key: string; beginFraction: number }> = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      items.push({
        key: `${id}-p${i}`,
        beginFraction: i / PARTICLE_COUNT,
      });
    }
    return items;
  }, [id]);

  return (
    <>
      <path
        id={`edge-path-${id}`}
        className="react-flow__edge-path"
        d={edgePath}
        style={style}
        markerEnd={markerEnd as string}
      />

      {visible && (
        <g className={draining ? "lab-edge-particle-drain" : undefined}>
          {particles.map(({ key, beginFraction }) =>
            isSquare ? (
              <rect
                key={key}
                x={-2.5}
                y={-2.5}
                width={5}
                height={5}
                rx={1}
                fill={strokeColor}
                opacity={0.7}
                className="lab-edge-particle"
              >
                <animateMotion
                  dur={PARTICLE_DURATION}
                  repeatCount="indefinite"
                  begin={`${beginFraction * DURATION_S}s`}
                  keyPoints="0;1"
                  keyTimes="0;1"
                  calcMode="linear"
                >
                  <mpath href={`#edge-path-${id}`} />
                </animateMotion>
              </rect>
            ) : (
              <circle
                key={key}
                r={3}
                fill={strokeColor}
                opacity={0.7}
                className="lab-edge-particle"
              >
                <animateMotion
                  dur={PARTICLE_DURATION}
                  repeatCount="indefinite"
                  begin={`${beginFraction * DURATION_S}s`}
                  keyPoints="0;1"
                  keyTimes="0;1"
                  calcMode="linear"
                >
                  <mpath href={`#edge-path-${id}`} />
                </animateMotion>
              </circle>
            ),
          )}
        </g>
      )}

      {label && (
        <EdgeLabelRenderer>
          <div
            className="lab-edge-particle-label nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              fontWeight: (labelStyle?.fontWeight as number) ?? 700,
              color: (labelStyle?.fill as string) ?? strokeColor,
              backgroundColor: (labelBgStyle?.fill as string) ?? "transparent",
              fontSize: 13,
              padding: "1px 6px",
              borderRadius: 4,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const AnimatedParticleEdge = memo(AnimatedParticleEdgeInner);
