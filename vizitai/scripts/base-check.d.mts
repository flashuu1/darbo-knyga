export function normalizeBase(b: string): string;
export function checkBase(i: { base: string; html: string; manifest: Record<string, unknown> & { icons?: { src: string }[] }; precacheUrls?: string[] }): string[];
