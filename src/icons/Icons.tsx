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

export function BluetoothIcon({ size = 22, ...props }: IconProps) {
  return <svg {...base(size)} {...props}><path d="m7 7 10 10-5 4V3l5 4L7 17" /></svg>;
}

export function MoreIcon({ size = 22, ...props }: IconProps) {
  return <svg {...base(size)} {...props}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>;
}

export function FarmIcon({ size = 22, ...props }: IconProps) {
  return <svg {...base(size)} {...props}><path d="m3 10 9-7 9 7v11H3zM3 10h18M8 21v-7h8v7M8 14l8 7M16 14l-8 7M10 7h4" /></svg>;
}

export function SearchIcon({ size = 22, ...props }: IconProps) {
  return <svg {...base(size)} {...props}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>;
}

export function SettingsIcon({ size = 22, ...props }: IconProps) {
  return <svg {...base(size)} {...props}><path d="m10 3-.5 2a7 7 0 0 0-2 .9l-2-.6-2 3.4 1.5 1.4a8 8 0 0 0 0 2.4L3.5 14l2 3.4 2-.6a7 7 0 0 0 2 .9L10 20h4l.5-2.3a7 7 0 0 0 2-.9l2 .6 2-3.4-1.5-1.5a8 8 0 0 0 0-2.4l1.5-1.4-2-3.4-2 .6a7 7 0 0 0-2-.9L14 3z" /><circle cx="12" cy="11.5" r="3" /></svg>;
}

export function KeyboardIcon({ size = 22, ...props }: IconProps) {
  return <svg {...base(size)} {...props}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 9h.01M12 9h.01M17 9h.01M7 12h.01M12 12h.01M17 12h.01M8 15h8" /></svg>;
}

export function PhoneIcon({ size = 22, ...props }: IconProps) {
  return <svg {...base(size)} {...props}><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 5h4M11 19h2M9 10c2-2 4-2 6 0M10.5 12c1-1 2-1 3 0" /></svg>;
}

export function StickReaderIcon({ size = 22, ...props }: IconProps) {
  return <svg {...base(size)} {...props}><path d="m7 5 3-3 5 5-3 3zM11 9l7 10-2 2L9 11M3 5c-1 2-1 4 0 6M5.5 6c-.5 1-.5 2 0 3" /></svg>;
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

export function ShareIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 10.7 6.8-4.4" />
      <path d="m8.6 13.3 6.8 4.4" />
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

export function CowIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M7.2 8.2 4.4 5.8c-.7-.6-1.6.1-1.3 1l1 3c.2.7.9 1.1 1.6 1" />
      <path d="m16.8 8.2 2.8-2.4c.7-.6 1.6.1 1.3 1l-1 3c-.2.7-.9 1.1-1.6 1" />
      <path d="M6.2 12.2c0-3.6 2.3-6.1 5.8-6.1s5.8 2.5 5.8 6.1v1.9c0 3.1-2.3 5.5-5.8 5.5s-5.8-2.4-5.8-5.5Z" />
      <path d="M9.2 8.4c.8-.6 1.7-.9 2.8-.9s2 .3 2.8.9" />
      <path d="M9.4 12.6h.01M14.6 12.6h.01" />
      <path d="M10.1 15.3c.8.6 3 .6 3.8 0" />
      <path d="M10.5 17.4h3" />
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

export function TrashIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

export function PlusIcon({ size = 22, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
