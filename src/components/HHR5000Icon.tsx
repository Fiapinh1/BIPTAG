import type { SVGProps } from 'react';

export type HHR5000IconState = 'disconnected' | 'connecting' | 'connected' | 'waiting' | 'warning' | 'error';

// Geometry from the supplied public/icons/biptag-bastao.svg; currentColor keeps it themeable.
export function HHR5000Icon({ size = 32, state, className = '', ...props }: SVGProps<SVGSVGElement> & { size?: number; state?: HHR5000IconState }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props} className={`hhr5000-icon ${state ? `hhr5000-icon--${state}` : ''} ${className}`} data-state={state}>
    {state === 'connecting' && <circle className="hhr5000-icon__loading" cx="32" cy="32" r="29" />}
    <g className="hhr5000-icon__body" transform="rotate(43 32 32)">
      <rect x="29" y="3" width="6" height="27" rx="3" />
      <rect x="23" y="28" width="18" height="15" rx="5" />
      <rect x="27" y="31" width="10" height="5" rx="1" />
      <path d="M28 43v14h8V43" />
      <rect x="26" y="57" width="12" height="4" rx="2" />
      <circle cx="32" cy="47" r="1" fill="currentColor" stroke="none" />
      <path d="M28 39h.1m8 0h.1" />
    </g>
  </svg>;
}
