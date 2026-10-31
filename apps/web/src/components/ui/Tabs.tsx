"use client";

import { useRef, type ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  /** Optional count badge (e.g. pending reports). */
  badge?: number;
};

type TabsProps = {
  items: ReadonlyArray<TabItem>;
  activeId: string;
  onChange: (id: string) => void;
  /** Prefix for the generated ids, so several tab lists can coexist. */
  idPrefix: string;
  label: string;
  className?: string;
};

/**
 * Accessible tab list.
 *
 * Follows the WAI-ARIA tabs pattern:
 * - roving tabindex (only the selected tab is in the tab order),
 * - Left/Right/Home/End arrow keys move the selection,
 * - every tab controls a panel that is always mounted (hidden with
 *   `hidden`), so `aria-controls` never points at a missing element.
 */
export function Tabs({ items, activeId, onChange, idPrefix, label, className = "" }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function moveSelection(from: number, delta: number) {
    const next = (from + delta + items.length) % items.length;
    const target = items[next];
    if (!target) return;
    onChange(target.id);
    // Keep the focus on the newly selected tab so the keyboard user does not
    // lose their place in the tab list.
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLButtonElement>(`#${cssEscape(idPrefix)}-tab-${target.id}`)?.focus();
    });
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      className={
        // On a narrow screen the three tabs do not fit on one line: they
        // scroll horizontally instead of wrapping, so the tab row keeps a
        // stable height and stays readable.
        // `w-full min-w-0` keeps the scroller from growing past its parent
        // (which would push the whole page sideways).
        "flex w-full min-w-0 gap-2 overflow-x-auto rounded-[var(--radius-control)] bg-brand-50 p-1 " +
        "[-ms-overflow-style:none] [scrollbar-width:none] " +
        "[&::-webkit-scrollbar]:hidden " +
        className
      }
    >
      {items.map((item, index) => {
        const selected = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                moveSelection(index, 1);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                moveSelection(index, -1);
              } else if (event.key === "Home") {
                event.preventDefault();
                moveSelection(0, 0);
              } else if (event.key === "End") {
                event.preventDefault();
                moveSelection(items.length - 1, 0);
              }
            }}
            className={
              "inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] px-4 text-sm font-medium transition-colors " +
              (selected
                ? "bg-primary-strong text-white"
                : "text-page-muted hover:bg-white hover:text-page-text")
            }
          >
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="rounded-full bg-danger px-1.5 text-xs font-semibold leading-5 text-white">
                {item.badge}
                <span className="sr-only"> élément(s) en attente</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A tab panel. Hidden panels stay mounted so the tab relationships hold and
 * the scroll position of each section is preserved when switching tabs.
 */
export function TabPanel({
  idPrefix,
  tabId,
  active,
  children,
  className = "",
}: {
  idPrefix: string;
  tabId: string;
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tabId}`}
      aria-labelledby={`${idPrefix}-tab-${tabId}`}
      hidden={!active}
      tabIndex={0}
      className={active ? className : ""}
    >
      {children}
    </div>
  );
}

/** Minimal CSS.escape fallback for ids containing a dash. */
function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
