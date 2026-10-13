export const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ');
export const foldName = (s: string) => cleanName(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const ltCollator = new Intl.Collator('lt');
