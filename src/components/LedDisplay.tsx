interface LedDisplayProps {
  /** What to show on the readout (number or short string). */
  value: number | string;
  /** Small caption above the display, like the cabinet's silkscreen labels. */
  label?: string;
  /** Glow colour of the lit digits. */
  color?: string;
  /** Approximate digit height in pixels. */
  size?: number;
  /** Minimum number of character cells (pads with blank, right-aligned). */
  digits?: number;
}

/**
 * A faux 7-segment LED readout: glowing monospace digits over a dark inset
 * panel, with faint "off" 8s behind them — the look of the cabinet's red LEDs.
 */
export default function LedDisplay({
  value,
  label,
  color = "#ff2d2d",
  size = 28,
  digits,
}: LedDisplayProps) {
  const text = String(value);
  const cells = Math.max(digits ?? text.length, text.length);
  const padded = text.padStart(cells, " ");

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-black/60">{label}</span>
      )}
      <div
        className="relative rounded-md border border-black/70 bg-[#1a0505] px-2 py-1 shadow-[inset_0_2px_6px_rgba(0,0,0,0.8)]"
        style={{ fontSize: size }}
      >
        {/* Unlit segments ghosted behind the value */}
        <span
          className="font-mono font-bold tabular-nums"
          style={{ color: "rgba(255,45,45,0.10)", letterSpacing: "0.12em" }}
          aria-hidden
        >
          {"8".repeat(cells)}
        </span>
        {/* Lit value, overlaid */}
        <span
          className="absolute inset-0 flex items-center justify-end px-2 font-mono font-bold tabular-nums"
          style={{
            color,
            letterSpacing: "0.12em",
            textShadow: `0 0 6px ${color}, 0 0 12px ${color}aa`,
            whiteSpace: "pre",
          }}
        >
          {padded}
        </span>
      </div>
    </div>
  );
}
