import type { SVGProps } from 'react';

// Geometry supplied in public/icons/nfc-reader.svg.
export function NfcReaderIcon({ size = 64, className = '', ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden="true" focusable="false" {...props} className={`nfc-reader-icon ${className}`}>
    <g className="nfc-reader-icon__signal" stroke="currentColor" strokeWidth="16" strokeLinecap="round"><path d="M170 92C218 50 294 50 342 92" /><path d="M202 132C232 105 280 105 310 132" /></g>
    <path d="M92 218C92 190 112 170 142 165C216 152 296 152 370 165C400 170 420 190 420 218L420 328C420 356 400 376 370 381C296 394 216 394 142 381C112 376 92 356 92 328Z" stroke="currentColor" strokeWidth="16" strokeLinejoin="round" />
    <path d="M136 218C136 205 145 197 158 195C222 185 290 185 354 195C367 197 376 205 376 218L376 328C376 341 367 349 354 351C290 361 222 361 158 351C145 349 136 341 136 328Z" stroke="currentColor" strokeWidth="7" strokeLinejoin="round" opacity=".28" />
    <rect x="188" y="250" width="136" height="46" rx="9" fill="currentColor" />
    <path d="M123 230V316M389 230V316" stroke="currentColor" strokeWidth="12" strokeLinecap="round" />
    <path d="M226 225C244 210 268 210 286 225" stroke="currentColor" strokeWidth="7" strokeLinecap="round" opacity=".55" />
  </svg>;
}
