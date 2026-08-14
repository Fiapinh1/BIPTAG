import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: number | string;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

export function StatCard({ label, value, hint, icon, tone = 'default' }: Props) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        {icon ? <span className="stat-card__icon">{icon}</span> : null}
      </div>
      <strong className="stat-card__value">{value}</strong>
      {hint ? <span className="stat-card__hint">{hint}</span> : null}
    </div>
  );
}
