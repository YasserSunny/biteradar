import Image from "next/image";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  orientation?: "horizontal" | "vertical";
  showTagline?: boolean;
}

export function Logo({
  size = "md",
  orientation = "horizontal",
  showTagline = false,
}: LogoProps) {
  const imgSize = size === "sm" ? 36 : size === "md" ? 48 : 64;
  const textSize =
    size === "sm"
      ? "text-2xl"
      : size === "md"
      ? "text-3xl"
      : "text-4xl sm:text-5xl";

  return (
    <div
      className={`flex items-center ${
        orientation === "vertical"
          ? "flex-col text-center gap-2"
          : "flex-row gap-3"
      }`}
    >
      <div
        className="relative shrink-0 rounded-2xl p-1 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-red-500/5 border border-orange-200/60 hover:border-red-300/80 shadow-xs transition-all duration-200 hover:scale-105"
        style={{ width: imgSize + 8, height: imgSize + 8 }}
      >
        <Image
          src="/logo.jpg"
          alt="BiteRadar Logo"
          width={imgSize}
          height={imgSize}
          className="rounded-xl object-contain mix-blend-multiply"
          priority
        />
      </div>
      <div className="flex flex-col">
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
