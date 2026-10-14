import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
};

/** White card: radius 16, padding 16, soft shadow, 1px border. */
export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={
        "rounded-[var(--radius-card)] border border-page-border bg-page-surface p-4 shadow-card " +
        className
      }
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="font-heading text-base font-semibold text-page-text">{children}</h3>;
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="mt-2 text-sm leading-6 text-page-muted">{children}</div>;
}
