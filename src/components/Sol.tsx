import { useId } from "react";

/** Solana mark: three slanted bars with the teal→purple gradient. */
export function SolIcon({ size = 12, className = "" }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`inline-block shrink-0 ${className}`} aria-label="SOL">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        <polygon points="6,3 23,3 18,8 1,8" />
        <polygon points="1,9.5 18,9.5 23,14.5 6,14.5" />
        <polygon points="6,16 23,16 18,21 1,21" />
      </g>
    </svg>
  );
}

/** An amount of SOL with the icon in front. */
export function Sol({ children, size = 11, className = "" }: { children: React.ReactNode; size?: number; className?: string }) {
  return (
    <span className={`num inline-flex items-center gap-1 ${className}`}>
      <SolIcon size={size} />
      {children}
    </span>
  );
}
