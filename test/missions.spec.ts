import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscription = vi.hoisted(() => ({ localList: vi.fn() }));
vi.mock('../../../src/base/subscription.ts', () => ({ default: subscription }));

import { listSubscribedMissions } from '../lib/missions.ts';

beforeEach(() => {
    subscription.localList.mockReset();
});

describe('listSubscribedMissions', () => {
    it('asks for subscribed Data Syncs with a write role', async () => {
        subscription.localList.mockResolvedValue(new Set());
        await listSubscribedMissions();
        expect(subscription.localList).toHaveBeenCalledWith({ role: 'MISSION_SUBSCRIBER', subscribed: true });
    });

    it('returns guid and name only, sorted by name', async () => {
        subscription.localList.mockResolvedValue(new Set([
            { guid: 'g2', name: 'Zulu', token: 'secret' },
            { guid: 'g1', name: 'alpha' },
            { guid: 'g3', name: 'Bravo' },
        ]));
        expect(await listSubscribedMissions()).toEqual([
            { guid: 'g1', name: 'alpha' },
            { guid: 'g3', name: 'Bravo' },
            { guid: 'g2', name: 'Zulu' },
        ]);
    });

    it('returns an empty list when there is none', async () => {
        subscription.localList.mockResolvedValue(new Set());
        expect(await listSubscribedMissions()).toEqual([]);
    });

    it('passes a failure on', async () => {
        subscription.localList.mockRejectedValue(new Error('db closed'));
        await expect(listSubscribedMissions()).rejects.toThrow('db closed');
    });
});
