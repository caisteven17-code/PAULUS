export const fieldBase =
  'border border-slate-200 bg-slate-50 transition-all placeholder:text-slate-300 focus:border-gold-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-gold-500/10';

export const fieldText = (hasValue: boolean) => (hasValue ? 'text-slate-950' : 'text-slate-400');

export const roundedField = (hasValue: boolean, extra = '') =>
  `${fieldBase} ${fieldText(hasValue)} ${extra}`.trim();

export const selectField = (hasValue: boolean, extra = '') =>
  `${fieldBase} ${fieldText(hasValue)} cursor-pointer appearance-none ${extra}`.trim();

export const dateField = (hasValue: boolean, extra = '') =>
  `${fieldBase} ${fieldText(hasValue)} [color-scheme:light] ${extra}`.trim();
