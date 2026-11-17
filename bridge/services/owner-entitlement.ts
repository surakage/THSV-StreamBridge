import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

// The creator's own PCs always run StreamBridge Pro: no key, no server check, never lapses, works offline.
//
// A PC is recognised by a hash of its Windows MachineGuid (set when Windows is installed, unique per PC).
// Only the hash is shipped, so the GUID cannot be read back from it, and another PC cannot match it without
// knowing the owner's GUID. To add a PC, run this in PowerShell on it and add the printed hash below:
//
//   $g=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid
//   $b=[Text.Encoding]::UTF8.GetBytes("streambridge-owner:$($g.Trim().ToLower())")
//   -join ([Security.Cryptography.SHA256]::Create().ComputeHash($b) | ForEach-Object { $_.ToString('x2') })
//
// A Windows reinstall gives the PC a new MachineGuid, so its hash must then be added again.

export const OWNER_MACHINE_HASHES: readonly string[] = [
  '82e79224b240d603f8eab776e9ab189201b8cdb99963eca88e4e9947dc666c4e', // Surakage's streaming PC (added 2026-11-17)
];

const run = promisify(execFile);

export function ownerMachineHash(machineGuid: string): string {
  return createHash('sha256').update(`streambridge-owner:${machineGuid.trim().toLowerCase()}`, 'utf8').digest('hex');
}

/** This PC's MachineGuid on Windows (machine-id elsewhere, for development), or undefined when it cannot be read. */
export async function readMachineGuid(): Promise<string | undefined> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { timeout: 10_000, windowsHide: true });
      return /MachineGuid\s+REG_SZ\s+(\S+)/iu.exec(stdout)?.[1];
    }
    return (await readFile('/etc/machine-id', 'utf8')).trim() || undefined;
  } catch { return undefined; }
}

/** True when this PC is one of the owner's. Never throws; an unreadable PC id counts as not the owner's. */
export async function isOwnerMachine(hashes: readonly string[] = OWNER_MACHINE_HASHES, read: () => Promise<string | undefined> = readMachineGuid): Promise<boolean> {
  if (hashes.length === 0) return false;
  const guid = await read().catch(() => undefined);
  return guid !== undefined && guid !== '' && hashes.includes(ownerMachineHash(guid));
}
