import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN = /probab|likelihood|percentile|confiden/i;

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? files(p) : [p];
    });
}

describe('wording', () => {
    it('keeps probability words out of the plugin text', () => {
        const targets = [join(root, 'index.ts'), join(root, 'README.md'), join(root, 'NOTICE'), ...files(join(root, 'lib'))];
        for (const file of targets) {
            let text: string;
            try {
                text = readFileSync(file, 'utf8');
            } catch {
                continue;
            }
            expect(FORBIDDEN.test(text), file).toBe(false);
        }
    });
});
