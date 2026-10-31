/** `1` -> `1 h`, `2.5` -> `2.5 h`, `0.25` -> `0.25 h`. */
export function formatHours(hours: number): string {
    return `${Number(hours.toFixed(2))} h`;
}

/** Seconds as `12 s` or `1 min 5 s`. */
export function formatElapsed(seconds: number): string {
    const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    if (s < 60) return `${s} s`;
    return `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** The date part of the roads and trails build time, in UTC, as `1 March 2026`; null when unknown or unreadable. */
export function formatBuilt(builtAt: string | null | undefined): string | null {
    if (typeof builtAt !== 'string' || builtAt === '') return null;
    const t = Date.parse(builtAt);
    if (!Number.isFinite(t)) return null;
    const d = new Date(t);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A kilometre value as the number itself, never rounded: `10` -> `10`, `6.25` -> `6.25`. */
export function formatKm(km: number): string {
    return String(km);
}

/** An ISO time as `2026-03-01 12:00 UTC`; the text itself when it cannot be read. */
export function formatUtc(iso: string): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return iso;
    return `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** An ISO time as `20260301-1200Z` for file names; `unknown-time` when it cannot be read. */
export function formatStamp(iso: string): string {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return 'unknown-time';
    return `${new Date(t).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}Z`;
}
