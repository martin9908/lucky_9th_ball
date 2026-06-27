const CONFETTI_COLORS = ["#f87171", "#fbbf24", "#34d399", "#60a5fa", "#c084fc", "#f472b6", "#facc15"];

interface CelebrationProps {
  type: "win" | "jackpot" | "ninebonus";
  amount?: number;
  freeSpins?: number;
}

/**
 * A full-screen, click-through celebration overlay: falling confetti plus a
 * popped-in banner. The 9-ball events get more confetti and their own copy.
 */
export default function Celebration({ type, amount, freeSpins }: CelebrationProps) {
  const pieceCount = type === "win" ? 26 : 70;
  const pieces = Array.from({ length: pieceCount }, (_, i) => {
    const size = 6 + Math.random() * 8;
    return (
      <span
        key={i}
        className="confetti-piece"
        style={{
          left: `${Math.random() * 100}%`,
          width: size,
          height: size * 0.6,
          background: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
          animationDelay: `${Math.random() * 0.3}s`,
          animationDuration: `${1.1 + Math.random() * 0.9}s`,
        }}
      />
    );
  });

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="celebrate-pop text-center">
          {type === "jackpot" ? (
            <>
              <div className="text-5xl font-black uppercase italic text-amber-300 drop-shadow-[0_3px_10px_rgba(0,0,0,0.7)] sm:text-6xl">
                The 9 Ball!
              </div>
              <div className="mt-2 text-2xl font-black uppercase tracking-wide text-pink-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
                {freeSpins} Free Spins!
              </div>
            </>
          ) : type === "ninebonus" ? (
            <>
              <div className="text-4xl font-black uppercase italic text-amber-300 drop-shadow-[0_3px_10px_rgba(0,0,0,0.7)] sm:text-5xl">
                9 Ball Bonus!
              </div>
              <div className="mt-2 text-3xl font-black text-emerald-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.7)]">
                +{amount}
              </div>
            </>
          ) : (
            <div className="text-6xl font-black text-emerald-300 drop-shadow-[0_3px_10px_rgba(0,0,0,0.7)] sm:text-7xl">
              +{amount}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
