import type { ColorKey } from './api.ts';

export interface Swatch {
  /** Tinted fill for routine blocks. */
  bg: string;
  /** Border and dots. */
  bd: string;
  /** Text; at least 4.5:1 on both `bg` and white. */
  fg: string;
  label: string;
}

export const PALETTE: Record<ColorKey, Swatch> = {
  orange: { bg: '#FDEBD3', bd: '#D9822B', fg: '#7A3E06', label: 'כתום' },
  cyan: { bg: '#D9EEF7', bd: '#2E90B8', fg: '#0B4A63', label: 'תכלת' },
  violet: { bg: '#E6E3FA', bd: '#6C5DD3', fg: '#3A2C8C', label: 'סגול' },
  green: { bg: '#D8F1E7', bd: '#2F9E77', fg: '#0E5239', label: 'ירוק' },
  lime: { bg: '#EAF2C9', bd: '#8DA61F', fg: '#47540A', label: 'ליים' },
  slate: { bg: '#E3E8EF', bd: '#5B6F8C', fg: '#2A3A52', label: 'אפור־כחול' },
  pink: { bg: '#FADDEA', bd: '#CF4A86', fg: '#7C1846', label: 'ורוד' },
  brown: { bg: '#F3E6DA', bd: '#A06A3C', fg: '#6B4423', label: 'חום' },
  gold: { bg: '#F7EDC6', bd: '#B08D12', fg: '#6B5200', label: 'זהב' },
  coral: { bg: '#FBE1DC', bd: '#D2553F', fg: '#8A2B1E', label: 'אלמוג' },
  blue: { bg: '#DEE6FB', bd: '#3F68D8', fg: '#1C3F94', label: 'כחול' },
  teal: { bg: '#D5F0EE', bd: '#1F9A93', fg: '#0B4F4B', label: 'טורקיז' },
};

export const BUSY_STYLE = {
  background: 'repeating-linear-gradient(135deg, #DCE2E8 0 5px, #F3F5F7 5px 10px)',
  border: '1px solid #9AA8BC',
  color: '#2A3A52',
} as const;
