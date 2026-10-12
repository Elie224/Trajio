import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return (
    <div className={"rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 " + className}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-base font-semibold text-slate-900">{children}</h3>;
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="mt-2 text-sm leading-6 text-slate-600">{children}</div>;
}
