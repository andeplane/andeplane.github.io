import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { usePrivatePearl } from '../tools/privateAssets';

it('requires a complete local export and always excludes it from public site builds', () => {
  const root=mkdtempSync(join(tmpdir(),'broadside-build-test-'));
  try {
    mkdirSync(join(root,'.private'));
    expect(usePrivatePearl('development',root,'')).toBe(false);
    writeFileSync(join(root,'.private','black-pearl.glb'),'test fixture');
    expect(usePrivatePearl('production',root,'')).toBe(false);
    writeFileSync(join(root,'.private','black-pearl.json'),'{}');
    expect(usePrivatePearl('development',root,'')).toBe(true);
    expect(usePrivatePearl('production',root,'')).toBe(true);
    expect(usePrivatePearl('public',root,'')).toBe(false);
    expect(usePrivatePearl('production',root,'1')).toBe(false);
  } finally {rmSync(root,{recursive:true,force:true});}
});
