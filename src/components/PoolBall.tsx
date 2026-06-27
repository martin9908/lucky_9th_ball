import { BALLS, type BallNumber } from "../game/types";

interface PoolBallProps {
  num: BallNumber;
  /** Diameter in pixels. */
  size?: number;
  /** Dim the ball (e.g. not the active/landed one). */
  dim?: boolean;
}

/**
 * A billiard ball: solid colour for 1–8, a white ball with a colour band for
 * the striped 9. A radial highlight gives it the glossy, lit-from-above sheen.
 */
export default function PoolBall({ num, size = 56, dim = false }: PoolBallProps) {
  const ball = BALLS[num];
  const discSize = size * 0.46;

  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        opacity: dim ? 0.45 : 1,
        background: ball.striped ? "#f8fafc" : ball.color,
        boxShadow: "inset 0 -6px 12px rgba(0,0,0,0.45), 0 3px 6px rgba(0,0,0,0.5)",
        transition: "opacity 120ms linear",
      }}
    >
      {/* Colour band for the striped 9 ball */}
      {ball.striped && (
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2"
          style={{ height: size * 0.5, background: ball.color }}
        />
      )}

      {/* Glossy highlight */}
      <div
        className="pointer-events-none absolute rounded-full"
        style={{
          left: "18%",
          top: "12%",
          width: "42%",
          height: "42%",
          background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.85), rgba(255,255,255,0) 70%)",
        }}
      />

      {/* White centre disc + number */}
      <div
        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white font-black"
        style={{
          width: discSize,
          height: discSize,
          fontSize: discSize * 0.62,
          color: ball.textColor,
          lineHeight: 1,
        }}
      >
        {num}
      </div>
    </div>
  );
}
