import { describe, expect, it } from 'vitest';
import { describeError, isRetryable } from '../lib/errors.ts';

describe('describeError', () => {
    it('uses the exact messages', () => {
        expect(describeError({ kind: 'unavailable' })).toBe('SAR planning is unavailable. Contact your administrator.');
        expect(describeError({ kind: 'timeout' })).toBe('The calculation took too long. Try a smaller radius.');
        expect(describeError({ kind: 'failed' })).toBe('Analysis failed. Try again, or try a smaller area.');
        expect(describeError({ kind: 'network' })).toBe('Could not reach the server. Check your connection and try again.');
        expect(describeError({ kind: 'cancelled' })).toBe('Calculation cancelled.');
        expect(describeError({ kind: 'invalid' })).toBe('The values were not accepted. Check the start point and the settings.');
    });
    it('shows the wait of a rate limit', () => {
        expect(describeError({ kind: 'busy', retryAfterS: 12 })).toBe('Too many requests. Try again in 12 seconds.');
        expect(describeError({ kind: 'busy', retryAfterS: 1 })).toBe('Too many requests. Try again in 1 second.');
        expect(describeError({ kind: 'busy' })).toBe('Too many requests. Wait a moment and try again.');
    });
    it('returns the server message of a refusal exactly as received', () => {
        const message = '  The area is  too dense.\nTry again. ';
        expect(describeError({ kind: 'rejected', message })).toBe(message);
        expect(describeError({ kind: 'rejected' })).toBe('Analysis failed. Try again, or try a smaller area.');
    });
    it('marks the errors a second try can fix', () => {
        expect(isRetryable('timeout')).toBe(true);
        expect(isRetryable('network')).toBe(true);
        expect(isRetryable('busy')).toBe(true);
        expect(isRetryable('rejected')).toBe(false);
        expect(isRetryable('unavailable')).toBe(false);
        expect(isRetryable('cancelled')).toBe(false);
    });
});
