"use client";

import { Minus, Plus } from "lucide-react";
import { useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children">;

/**
 * Checkbox de la marca. Sigue siendo un <input type="checkbox"> real (formularios, teclado y
 * lectores de pantalla funcionan igual); solo cambia el dibujo. Acepta las mismas props.
 */
export function Checkbox({ label, hint, className, ...props }: NativeInput & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={`ui-check${props.disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}>
      <input {...props} className="ui-check-input" type="checkbox" />
      <span aria-hidden="true" className="ui-check-box" />
      <span className="ui-check-text">{label}{hint ? <small>{hint}</small> : null}</span>
    </label>
  );
}

/** Radio de la marca: <input type="radio"> real con dibujo propio. */
export function Radio({ label, hint, className, ...props }: NativeInput & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className={`ui-check ui-radio${props.disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}>
      <input {...props} className="ui-check-input" type="radio" />
      <span aria-hidden="true" className="ui-check-box" />
      <span className="ui-check-text">{label}{hint ? <small>{hint}</small> : null}</span>
    </label>
  );
}

/** Interruptor encendido/apagado: checkbox real con role="switch". */
export function Switch({ label, className, ...props }: NativeInput & { label: ReactNode }) {
  return (
    <label className={`ui-switch${props.disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}>
      <input {...props} className="ui-switch-input" role="switch" type="checkbox" />
      <span aria-hidden="true" className="ui-switch-track"><span className="ui-switch-thumb" /></span>
      <span className="ui-switch-text">{label}</span>
    </label>
  );
}

/**
 * Número con botones − y +. Es un <input type="number"> real (mismo name, min, max y step para
 * formularios) sin las flechitas del navegador. Controlado (value + onChange) o no (defaultValue).
 */
export function NumberInput({
  value,
  defaultValue,
  onChange,
  min,
  max,
  step = 1,
  ariaLabel,
  className,
  invalid,
  ...props
}: Omit<NativeInput, "value" | "defaultValue" | "onChange" | "min" | "max" | "step"> & {
  value?: number | "";
  defaultValue?: number;
  onChange?: (value: number | "") => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  invalid?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inner, setInner] = useState<number | "">(defaultValue ?? "");
  const current = value ?? inner;

  function commit(next: number | "") {
    if (value === undefined) setInner(next);
    onChange?.(next);
  }

  function bump(direction: 1 | -1) {
    const base = current === "" ? (min ?? 0) : current;
    let next = Math.round((base + direction * step) * 1000) / 1000;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    commit(next);
    inputRef.current?.focus();
  }

  const atMin = min !== undefined && current !== "" && current <= min;
  const atMax = max !== undefined && current !== "" && current >= max;

  return (
    <div className={`ui-number${invalid ? " is-invalid" : ""}${props.disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}>
      <button aria-label="Restar" className="ui-number-button" disabled={props.disabled || atMin} onClick={() => bump(-1)} tabIndex={-1} type="button"><Minus size={16} /></button>
      <input
        {...props}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel ?? props["aria-label"]}
        className="ui-number-input"
        inputMode={Number.isInteger(step) ? "numeric" : "decimal"}
        max={max}
        min={min}
        onChange={(event) => commit(event.target.value === "" ? "" : Number(event.target.value))}
        ref={inputRef}
        step={step}
        type="number"
        value={current}
      />
      <button aria-label="Sumar" className="ui-number-button" disabled={props.disabled || atMax} onClick={() => bump(1)} tabIndex={-1} type="button"><Plus size={16} /></button>
    </div>
  );
}
