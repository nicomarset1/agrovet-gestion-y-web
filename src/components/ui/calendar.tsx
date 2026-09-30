"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { addDays, addMonths, formatLongDate, getCalendarGrid, monthTitle, toIsoDate, WEEKDAYS_SHORT } from "./date-utils";

export type DayState = {
  selected?: boolean;
  rangeStart?: boolean;
  rangeEnd?: boolean;
  inRange?: boolean;
};

/**
 * Grilla de un mes con navegación por teclado (patrón "grid" de WAI-ARIA), compartida por
 * DatePicker y DateRangePicker. Foco itinerante: solo el día activo tiene tabIndex 0.
 * Flechas mueven un día o una semana, Inicio/Fin van al lunes/domingo, RePág/AvPág cambian de mes
 * y Enter o espacio eligen. El mes visible sigue al día enfocado.
 */
export function Calendar({
  focusedDate,
  onFocusDate,
  onSelect,
  onHover,
  dayState,
  isDisabled,
  labelledBy,
}: {
  focusedDate: Date;
  onFocusDate: (date: Date) => void;
  onSelect: (date: Date) => void;
  onHover?: (date: Date | null) => void;
  dayState: (iso: string) => DayState;
  isDisabled?: (date: Date) => boolean;
  labelledBy: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const focusedIso = toIsoDate(focusedDate);
  const grid = getCalendarGrid(focusedDate.getFullYear(), focusedDate.getMonth());
  const todayIso = toIsoDate(new Date());
  const weeks = Array.from({ length: 6 }, (_, week) => grid.slice(week * 7, week * 7 + 7));

  // Si el foco ya estaba dentro de la grilla, acompaña al día activo al moverse con el teclado.
  useEffect(() => {
    const root = gridRef.current;
    if (!root || !root.contains(document.activeElement)) return;
    root.querySelector<HTMLElement>(`[data-iso="${focusedIso}"]`)?.focus();
  }, [focusedIso]);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focusedDate, -1),
      ArrowRight: () => addDays(focusedDate, 1),
      ArrowUp: () => addDays(focusedDate, -7),
      ArrowDown: () => addDays(focusedDate, 7),
      Home: () => addDays(focusedDate, -((focusedDate.getDay() + 6) % 7)),
      End: () => addDays(focusedDate, 6 - ((focusedDate.getDay() + 6) % 7)),
      PageUp: () => addMonths(focusedDate, event.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focusedDate, event.shiftKey ? 12 : 1),
    };
    if (moves[event.key]) {
      event.preventDefault();
      const next = moves[event.key]();
      onFocusDate(next);
      onHover?.(next);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isDisabled?.(focusedDate)) onSelect(focusedDate);
    }
  }

  return (
    <div className="ui-calendar">
      <div className="ui-calendar-head">
        <button aria-label="Mes anterior" className="ui-calendar-nav" onClick={() => onFocusDate(addMonths(focusedDate, -1))} type="button">
          <ChevronLeft size={18} />
        </button>
        <span aria-live="polite" className="ui-calendar-title" id={labelledBy}>{monthTitle(focusedDate)}</span>
        <button aria-label="Mes siguiente" className="ui-calendar-nav" onClick={() => onFocusDate(addMonths(focusedDate, 1))} type="button">
          <ChevronRight size={18} />
        </button>
      </div>
      <div aria-labelledby={labelledBy} className="ui-calendar-grid" onKeyDown={onKeyDown} onMouseLeave={() => onHover?.(null)} ref={gridRef} role="grid">
        <div className="ui-calendar-row ui-calendar-weekdays" role="row">
          {WEEKDAYS_SHORT.map((day) => <span className="ui-calendar-weekday" key={day} role="columnheader">{day}</span>)}
        </div>
        {weeks.map((week) => (
          <div className="ui-calendar-row" key={toIsoDate(week[0].date)} role="row">
            {week.map(({ date, inMonth }) => {
              const iso = toIsoDate(date);
              const state = dayState(iso);
              const disabled = isDisabled?.(date) ?? false;
              const classes = [
                "ui-day",
                inMonth ? "" : "is-outside",
                iso === todayIso ? "is-today" : "",
                state.inRange ? "is-in-range" : "",
                state.rangeStart ? "is-range-start" : "",
                state.rangeEnd ? "is-range-end" : "",
                state.selected ? "is-selected" : "",
              ].filter(Boolean).join(" ");
              return (
                <div aria-selected={Boolean(state.selected || state.inRange)} className="ui-day-cell" key={iso} role="gridcell">
                  <button
                    aria-disabled={disabled || undefined}
                    aria-label={formatLongDate(date)}
                    aria-current={iso === todayIso ? "date" : undefined}
                    className={classes}
                    data-iso={iso}
                    onClick={() => { if (!disabled) onSelect(date); }}
                    onFocus={() => { if (iso !== focusedIso) onFocusDate(date); }}
                    onMouseEnter={() => onHover?.(date)}
                    tabIndex={iso === focusedIso ? 0 : -1}
                    type="button"
                  >
                    {date.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
