"use client";

import { useRef, type ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  /** Shorter wording shown below the `sm` breakpoint, when space is tight. */
  short?: string;
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
      // `flex-wrap`: the tabs wrap onto a second line on a narrow screen
      // instead of scrolling. A horizontal scroller here would make the
      // document itself scrollable sideways on mobile.
      className={"flex flex-wrap gap-2 rounded-[var(--radius-control)] bg-brand-50 p-1 " + className}
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
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] px-2.5 text-sm font-medium transition-colors sm:gap-2 sm:px-4 " +
              (selected
                ? "bg-primary-strong text-white"
                : "text-page-muted hover:bg-white hover:text-page-text")
            }
            // The accessible name is always the full label, whatever the
            // wording shown on screen at the current width.
            aria-label={item.label}
          >
            {item.short && (
              <>
                <span aria-hidden="true" className="sm:hidden">
                  {item.short}
                </span>
                <span className="hidden sm:inline">{item.label}</span>
              </>
            )}
            {!item.short && item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="rounded-full bg-danger px-1.5 text-xs font-semibold leading-5 text-white sm:px-2">
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
