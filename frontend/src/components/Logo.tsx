interface LogoProps {
  size?: "sm" | "md" | "lg";
  orientation?: "horizontal" | "vertical";
  showTagline?: boolean;
}

export function BiteRadarIcon({ size = 48 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform duration-300 group-hover:scale-105"
    >
      {/* Outer circular radar telemetry ring */}
      <circle
        cx="50"
        cy="50"
        r="44"
        stroke="#f97316"
        strokeWidth="3.5"
        strokeDasharray="22 8 36 8"
        strokeLinecap="round"
        opacity="0.9"
      />

      {/* Radar scanning waves (Golden-Amber) */}
      <path
        d="M 44 14 A 38 38 0 0 1 86 54"
        stroke="#f59e0b"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M 46 22 A 30 30 0 0 1 78 52"
        stroke="#d97706"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M 48 30 A 22 22 0 0 1 70 50"
        stroke="#b45309"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Steam wisps */}
      <path
        d="M 33 50 Q 30 44 33 38"
        stroke="#fb923c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M 38 48 Q 35 42 38 36"
        stroke="#fb923c"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Culinary Food Bowl (Warm Sunset Orange) */}
      <path
        d="M 24 58 Q 50 62 76 58"
        stroke="#ea580c"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M 25 58 C 27 79, 73 79, 75 58"
        stroke="#ea580c"
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="#fff7ed"
      />
      <path
        d="M 75 62 C 84 62, 84 72, 73 73"
        stroke="#ea580c"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M 38 79 L 34 86 M 62 79 L 66 86 M 31 86 L 69 86"
        stroke="#ea580c"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Central Geo Pin - BOLD SOLID RED */}
      <path
        d="M 50 18 C 39 18, 30 27.5, 30 38.5 C 30 53, 50 66, 50 66 C 50 66, 70 53, 70 38.5 C 70 27.5, 61 18, 50 18 Z"
        fill="#dc2626"
        stroke="#b91c1c"
        strokeWidth="1.5"
      />
      {/* Crisp white aperture hole */}
      <circle cx="50" cy="38" r="6.5" fill="#ffffff" />
    </svg>
  );
}

export function Logo({
  size = "md",
  orientation = "horizontal",
  showTagline = false,
}: LogoProps) {
  const iconPixelSize = size === "sm" ? 36 : size === "md" ? 48 : 68;
  const textSize =
    size === "sm"
      ? "text-2xl"
      : size === "md"
      ? "text-3xl"
      : "text-4xl sm:text-5xl";

  return (
    <div
      className={`group flex items-center ${
        orientation === "vertical"
          ? "flex-col text-center gap-2"
          : "flex-row gap-3"
      }`}
    >
      <div
        className="relative shrink-0 rounded-2xl p-1.5 bg-gradient-to-br from-orange-500/10 via-amber-500/10 to-red-500/10 border border-orange-200/80 hover:border-red-300 shadow-xs transition-all duration-200"
      >
        <BiteRadarIcon size={iconPixelSize} />
      </div>
      <div className="flex flex-col select-none">
        <span
          className={`font-black tracking-tight ${textSize} text-gray-900 leading-none`}
        >
          Bite<span className="text-orange-600">Radar</span>
        </span>
        {showTagline && (
          <span className="text-xs font-semibold uppercase tracking-widest text-orange-600/80 mt-1">
            AI Food Discovery
          </span>
        )}
      </div>
    </div>
  );
}
