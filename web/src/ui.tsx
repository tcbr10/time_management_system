import type { ReactNode } from 'react';
import type { UserDto } from './api.ts';

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" aria-hidden="true" width={size} height={size} viewBox="0 0 30 30" fill="none">
      <rect x="2" y="2" width="26" height="26" rx="8" stroke="currentColor" strokeWidth="2.4" />
      <path d="M15 8.5V15l4.5 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type IconName = 'prev' | 'next' | 'plus' | 'close' | 'settings' | 'back' | 'filter';

const ICON_PATHS: Record<IconName, string> = {
  // In a right-to-left layout "previous" points right.
  prev: 'M7 3.5l5.5 5.5L7 14.5',
  next: 'M11 3.5L5.5 9l5.5 5.5',
  plus: 'M9 3v12M3 9h12',
  close: 'M4 4l10 10M14 4L4 14',
  back: 'M7 3.5l5.5 5.5L7 14.5',
  filter: 'M3 5h12M5.5 9h7M8 13h2',
  settings: 'M9 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM9 2v2M9 14v2M2 9h2M14 9h2M4.1 4.1l1.4 1.4M12.5 12.5l1.4 1.4M4.1 13.9l1.4-1.4M12.5 5.5l1.4-1.4',
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d={ICON_PATHS[name]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Initial of a user; the signed-in user is filled, others outlined, so they differ without colour. */
export function Avatar({ user, filled }: { user: UserDto; filled: boolean }) {
  return (
    <span className={filled ? 'avatar avatar--filled' : 'avatar'} aria-hidden="true">
      {user.displayName.slice(0, 1)}
    </span>
  );
}

export function Switch({ on }: { on: boolean }) {
  return (
    <span className={on ? 'switch switch--on' : 'switch'} aria-hidden="true">
      <span className="switch__knob" />
    </span>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="field">
      {htmlFor ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="field__label">{label}</span>
      )}
      {children}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === props.value ? 'segmented__item segmented__item--on' : 'segmented__item'}
          aria-pressed={option.value === props.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="note note--error" role="alert">
      {message}
    </p>
  );
}
