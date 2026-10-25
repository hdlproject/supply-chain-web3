import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p className="page-header-sub">{description}</p> : null}
      </div>
      {actions ? <div>{actions}</div> : null}
    </header>
  );
}

export type StatTone = "accent" | "violet" | "amber" | "cyan";

const TONE_COLORS: Record<StatTone, string> = {
  accent: "var(--accent)",
  violet: "var(--violet)",
  amber: "var(--amber)",
  cyan: "var(--accent-2)",
};

export function Stats({
  items,
}: {
  items: { label: string; value: number | string; tone?: StatTone }[];
}) {
  return (
    <div className="stats" style={{ "--n": items.length } as React.CSSProperties}>
      {items.map((item) => (
        <div
          key={item.label}
          className="stat"
          style={{ "--stat-color": TONE_COLORS[item.tone ?? "accent"] } as React.CSSProperties}
        >
          <div className="stat-label">{item.label}</div>
          <div className="stat-value">{item.value}</div>
        </div>
      ))}
    </div>
  );
}
