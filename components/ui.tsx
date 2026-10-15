import * as React from "react";
import { cn } from "@/lib/format";

/* shadcn/ui 컴포넌트 패턴(slate 테마)을 따른 최소 구성 */

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border bg-card text-card-foreground shadow-sm", className)} {...p} />;
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...p} />;
}
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[15px] font-semibold leading-tight", className)} {...p} />;
}
export function CardDescription({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] text-muted-foreground", className)} {...p} />;
}
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...p} />;
}

type BadgeTone = "default" | "outline" | "critical" | "warning" | "good" | "muted";
export function Badge({
  tone = "default",
  className,
  ...p
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    default: "bg-primary text-primary-foreground border-transparent",
    outline: "text-foreground",
    muted: "bg-muted text-muted-foreground border-transparent",
    critical: "border-status-critical/40 bg-status-critical/10 text-foreground",
    warning: "border-status-warning/50 bg-status-warning/15 text-foreground",
    good: "border-status-good/40 bg-status-good/10 text-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...p}
    />
  );
}

export function Button({
  variant = "default",
  size = "default",
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}) {
  const v = {
    default: "bg-primary text-primary-foreground hover:opacity-90",
    outline: "border bg-card hover:bg-accent",
    ghost: "hover:bg-accent",
  }[variant];
  const s = { default: "h-9 px-4 text-sm", sm: "h-8 px-3 text-[13px]" }[size];
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
        v,
        s,
        className,
      )}
      {...p}
    />
  );
}

/** 단일 선택 세그먼트 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o}
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-[13px] transition-colors",
            value === o ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** 다중 선택 칩 */
export function ChipGroup({
  values,
  options,
  onChange,
  label,
  format = String,
}: {
  values: number[];
  options: number[];
  onChange: (v: number[]) => void;
  label: string;
  format?: (v: number) => string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1">
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <button
            key={o}
            aria-pressed={on}
            onClick={() => {
              const next = on ? values.filter((v) => v !== o) : [...values, o].sort((a, b) => a - b);
              if (next.length) onChange(next);
            }}
            className={cn(
              "rounded-md border px-2 py-1 text-[13px] transition-colors tabular",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent",
            )}
          >
            {format(o)}
          </button>
        );
      })}
    </div>
  );
}

export function Table({ className, ...p }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-[13px]", className)} {...p} />
    </div>
  );
}
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className="[&_tr]:border-b" {...p} />
);
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className="[&_tr:last-child]:border-0" {...p} />
);
export function TR({ className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("border-b transition-colors", className)} {...p} />;
}
export function TH({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("h-9 whitespace-nowrap px-2 text-left align-middle text-xs font-medium text-muted-foreground", className)}
      {...p}
    />
  );
}
export function TD({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-2 py-2 align-middle", className)} {...p} />;
}
