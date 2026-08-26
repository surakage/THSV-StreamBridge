import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface ActionContract {
  readonly id: string;
  readonly name: string;
  readonly brokerDispatched?: boolean;
  readonly mustRemainTriggerless?: boolean;
  readonly triggers?: readonly unknown[];
}

describe('Streamer.bot broker action contracts', () => {
  it('declares every broker-dispatched action explicitly and keeps it triggerless', async () => {
    const root = join('packages', 'streamerbot');
    const folders = await readdir(root, { withFileTypes: true });
    const brokerActions: ActionContract[] = [];
    for (const folder of folders.filter((entry) => entry.isDirectory())) {
      try {
        const manifest = JSON.parse(await readFile(join(root, folder.name, 'manifest.json'), 'utf8')) as { actions?: ActionContract[] };
        for (const action of manifest.actions ?? []) {
          if (action.mustRemainTriggerless === true) expect(action.brokerDispatched, `${action.name} must declare broker dispatch`).toBe(true);
          if (action.brokerDispatched !== true) continue;
          brokerActions.push(action);
          expect(action.mustRemainTriggerless, `${action.name} must remain triggerless`).toBe(true);
          expect(action.triggers ?? [], `${action.name} cannot ship a trigger`).toHaveLength(0);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    expect(new Set(brokerActions.map((action) => action.id))).toEqual(new Set([
      '08cf5035-09ce-45b7-bef5-c5f7081d17f6', '0c4d8af8-593c-5e6a-b07f-948079c22cd1',
      '0f16105e-7c92-47ad-a61b-c6d1b934fdf0', '0f41b0d1-7c7a-4a1c-9f11-5ab9cc86b301',
      '183afef4-fc53-4337-859f-c9fe6d1961e1', '18a8de7c-1c5f-4a1e-8d58-7944c74060d5',
      '1f8e660b-3ee9-4a9a-9390-68d7e5257c11', '26c6f03c-b616-4db5-8c56-e0abe2dc3b6c',
      '5807e453-1cdb-49bf-bad8-d50f785cbc77', '6a78d950-17b5-4a98-9de7-1a5b4275f31c',
      '6cd2c22e-631c-4b78-91bd-c67169ce989b', '6d957f70-37fa-47d9-aa42-36f54fdb034c',
      '74e6fc7e-39cd-4de3-a9ad-4ed7ef049196', '764a4658-e7fc-4b25-a792-e262759c76b7',
      '7e9b4db8-5d33-4ed2-a8d1-11f8d04ab662', '9422099b-df85-4d50-99c0-87fcbc120814',
      '9b8d5b4a-6a6f-4f63-a09a-85bddc872ea9', '9d7b9f62-8f33-41a0-b7d8-a2d247a02fd3',
      '9df94d73-b90c-4eeb-8992-1a902f99cc98', 'a6c9d452-7627-4bc2-b0b3-46735d8aa120',
      'ad2b29a1-4e8e-4f0b-9ac2-6c4e5f473e12', 'ad3cf90f-b320-5ae2-a493-485a5485e0ce',
      'b99f5eae-d962-4b71-b2c5-64c19917189f', 'c84fdb40-d06f-5b0a-9ddf-f6d21c68922e',
      'd12e5b98-4dc5-5f0c-b54d-85cfe3a4f7b2', 'd4c4d0c6-5466-4a30-b437-7fd582f69038',
      'd72d0873-8cbd-4dd5-a171-6b7122cd125e', 'df40969d-5923-4432-bdca-ecdee451f150',
      'df4ee3e7-cee1-48e7-b301-5533d57c11d8', 'e0907527-94ec-466b-a05f-b5b21930ac55',
      'e3d92d7e-193a-5bba-8b8c-4f17e605c9d2', 'f89e397b-7106-5101-a620-b0f5da4facf9',
      'fa5b3b6d-a639-48a6-9999-7e5b11f31590',
    ]));
  });
});
