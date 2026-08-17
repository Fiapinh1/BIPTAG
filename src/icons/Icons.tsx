import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
});

export function BiptagMark({ size = 28, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 4h9l5 5v11H5z" />
      <circle cx="14.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
      <path d="M8.2 13.6c2.5-2.3 5.1-2.3 7.6 0" />
      <path d="M9.8 16c1.4-1.2 2.9-1.2 4.4 0" />
    </svg>
  );
}

export function HomeIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 10.5 12 4l8 6.5V20H4z" />
      <path d="M9.5 20v-5h5v5" />
    </svg>
  );
}

export function ImportIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5" />
      <path d="M12 11v6" />
      <path d="m9.5 14.5 2.5 2.5 2.5-2.5" />
    </svg>
  );
}

export function ScanIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M7 3H4v3M17 3h3v3M7 21H4v-3M17 21h3v-3" />
      <path d="M8.5 9.7c2.3-2.1 4.7-2.1 7 0" />
      <path d="M10 12c1.3-1.2 2.7-1.2 4 0" />
      <circle cx="12" cy="15.2" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IssuesIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 3 21 20H3z" />
      <path d="M12 9v5" />
      <path d="M12 17.3h.01" />
    </svg>
  );
}

export function CheckIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.6 2.6L16.5 9" />
    </svg>
  );
}

export function CloudIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M7 18h10a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.4 8.6 4.8 4.8 0 0 0 7 18Z" />
      <path d="M12 11v5M9.8 13.2 12 11l2.2 2.2" />
    </svg>
  );
}

export function ReportIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 3h10l4 4v14H5z" />
      <path d="M15 3v5h5" />
      <path d="M8 12h8M8 16h8" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

export function PauseIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function PlayIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="m8 5 11 7-11 7z" />
    </svg>
  );
}

export function SwapIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 7h12" />
      <path d="m14 4 3 3-3 3" />
      <path d="M19 17H7" />
      <path d="m10 14-3 3 3 3" />
    </svg>
  );
}

export function TagIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4.5 6.5v7.2L11 20l8.5-8.5L13.2 5H6a1.5 1.5 0 0 0-1.5 1.5Z" />
      <circle cx="8.5" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 9.5h3.2M10.2 12.4h5.8" />
    </svg>
  );
}

export function AnimalIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M6.5 9.5 4 6M17.5 9.5 20 6" />
      <path d="M6 12c0-3.2 2.4-5.5 6-5.5s6 2.3 6 5.5v2.2c0 2.9-2.4 5.3-6 5.3s-6-2.4-6-5.3Z" />
      <path d="M9 13h.01M15 13h.01" />
      <path d="M10 16.2h4" />
    </svg>
  );
}

export function ActionIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M5 4h14v16H5z" />
      <path d="M8 8h8M8 12h5" />
      <path d="m9 16 1.6 1.6L16 12.2" />
    </svg>
  );
}
