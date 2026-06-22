/** Inline SVG icon set — platforms and chat roles. */

type IconProps = { size?: number; color?: string };

export function PenIcon({ size = 14, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

export function EraserIcon({ size = 14, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 21h10" />
      <path d="M22 9.7 12.3 20H7.7L2 14.3 12.3 4a2.4 2.4 0 0 1 3.4 0L22 10.3" />
    </svg>
  );
}

export function ClearIcon({ size = 14, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

export function TwitchIcon({ size = 14, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M4.3 1L1.5 5.7v15.8h5.4V24h3l2.7-2.5h4.2L22.5 16V1H4.3zm16.2 14.1l-3.3 3h-5.1l-2.7 2.5v-2.5H5.1V3h15.4v12.1zM17 6.8v5.7h-2V6.8h2zm-5.4 0v5.7h-2V6.8h2z" />
    </svg>
  );
}

export function KickIcon({ size = 14, color = '#000' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M3 2h7v6l4-4h7l-7 8 7 8h-7l-4-4v6H3V2z" />
    </svg>
  );
}

export function YouTubeIcon({ size = 14, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12l-6.2 3.6z" />
    </svg>
  );
}

export function TikTokIcon({ size = 14, color = '#fff' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

/** Moderator — sword (Twitch-style). */
export function ModIcon({ size = 13, color = '#27A8FF' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M21 3l-7.5 7.5L9 6 3 12l4.5 4.5L3 21h6l1.5-1.5L15 24l6-6-4.5-4.5L24 6V3h-3zM7.8 15.3L5.7 13.2l3.3-3.3 2.1 2.1-3.3 3.3z" />
    </svg>
  );
}

/** Subscriber — star. */
export function SubIcon({ size = 13, color = '#D6A23A' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2l-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8L12 2z" />
    </svg>
  );
}

/** VIP — diamond. */
export function VipIcon({ size = 13, color = '#E005B9' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M6 3h12l4 6-10 12L2 9l4-6zm2.7 6L12 16.6 15.3 9H8.7z" />
    </svg>
  );
}

// --- Activity event icons ---

export function HeartIcon({ size = 13, color = '#FF3045' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12 21S3 14.4 3 8.6C3 5.5 5.4 3 8.4 3c1.9 0 3.2 1 3.6 1.7C12.4 4 13.7 3 15.6 3 18.6 3 21 5.5 21 8.6 21 14.4 12 21 12 21z" />
    </svg>
  );
}

export function GiftIcon({ size = 13, color = '#53FC18' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M20 7h-2.2c.4-.6.7-1.3.7-2 0-1.7-1.3-3-3-3-1.5 0-2.6 1-3.5 2.1C11.1 3 10 2 8.5 2c-1.7 0-3 1.3-3 3 0 .7.3 1.4.7 2H4a2 2 0 0 0-2 2v3h9V9h2v3h9V9a2 2 0 0 0-2-2zm-9 14H4a1 1 0 0 1-1-1v-6h8v7zm10-1a1 1 0 0 1-1 1h-7v-7h8v6z" />
    </svg>
  );
}

export function RaidIcon({ size = 13, color = '#27A8FF' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

export function CoinIcon({ size = 13, color = '#D6A23A' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15.5V19h-2v-1.5c-1.8-.3-3-1.4-3.2-3h2.1c.2.8.9 1.3 2.1 1.3 1.3 0 1.9-.5 1.9-1.2 0-.6-.5-1-1.7-1.3l-1.4-.3C8.9 12.6 8 11.7 8 10.2 8 8.7 9.2 7.6 11 7.3V6h2v1.4c1.6.3 2.7 1.3 2.9 2.8h-2.1c-.2-.7-.8-1.1-1.8-1.1-1.1 0-1.7.4-1.7 1.1 0 .6.5.9 1.6 1.2l1.4.3c2 .5 2.9 1.4 2.9 2.9 0 1.6-1.3 2.7-3.2 2.9z" />
    </svg>
  );
}
