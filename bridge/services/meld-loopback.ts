import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Meld Studio comes from the Microsoft Store, and Windows stops Store apps from opening pages on this same PC
// ("loopback"). Until Meld gets a one-time loopback exemption it shows StreamBridge's overlays and wizard as blank.
// This finds Meld's package, checks whether the exemption is there, and, when the creator presses the button, adds it
// through the normal Windows administrator prompt. Only Meld's own exemption is read or changed.

export interface MeldLoopbackStatus {
  readonly supported: boolean;
  /** Meld Studio is installed from the Microsoft Store on this Windows account. */
  readonly installed: boolean;
  /** Meld may open StreamBridge's pages. */
  readonly allowed: boolean;
}
export type MeldLoopbackRunner = (file: string, args: readonly string[], timeoutMs: number) => Promise<{ readonly code: number; readonly stdout: string }>;

export class MeldLoopbackError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

const execFileAsync = promisify(execFile);
const defaultRunner: MeldLoopbackRunner = async (file, args, timeoutMs) => {
  try { const { stdout } = await execFileAsync(file, [...args], { encoding: 'utf8', windowsHide: true, timeout: timeoutMs }); return { code: 0, stdout }; }
  catch (error) { const failure = error as { code?: unknown; stdout?: unknown }; return { code: typeof failure.code === 'number' ? failure.code : -1, stdout: typeof failure.stdout === 'string' ? failure.stdout : '' }; }
};
const encode = (script: string): string => Buffer.from(script, 'utf16le').toString('base64');
const FAMILY = /^[A-Za-z0-9.-]{3,100}_[a-z0-9]{13}$/u;

export class MeldLoopback {
  public constructor(private readonly runner: MeldLoopbackRunner = defaultRunner, private readonly supported = process.platform === 'win32') {}

  /** Reading the exemption list needs no administrator rights. */
  public async status(): Promise<MeldLoopbackStatus & { readonly family?: string }> {
    if (!this.supported) return { supported: false, installed: false, allowed: true };
    const script = [
      "$family = @(Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*Meld*' } | Select-Object -ExpandProperty PackageFamilyName)[0]",
      "if (-not $family) { Write-Output 'family='; exit 0 }",
      "$list = (& CheckNetIsolation.exe LoopbackExempt -s) -join \"`n\"",
      "$allowed = $list.ToLowerInvariant().Contains($family.ToLowerInvariant())",
      'Write-Output "family=$family allowed=$allowed"',
    ].join('\n');
    const result = await this.runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(script)], 20_000);
    const family = /family=(\S*)/u.exec(result.stdout)?.[1] ?? '';
    if (result.code !== 0 || !FAMILY.test(family)) return { supported: true, installed: false, allowed: false };
    return { supported: true, installed: true, allowed: /allowed=True/u.test(result.stdout), family };
  }

  /** Adds Meld's loopback exemption through the Windows administrator prompt, which the creator must accept on this PC. */
  public async allow(): Promise<MeldLoopbackStatus> {
    if (!this.supported) throw new MeldLoopbackError(400, 'This only applies to Windows.');
    const before = await this.status();
    if (!before.installed || before.family === undefined) throw new MeldLoopbackError(404, 'Meld Studio from the Microsoft Store was not found on this Windows account. Install or open Meld Studio, then try again.');
    if (before.allowed) return { supported: true, installed: true, allowed: true };
    const launcher = `try { $p = Start-Process CheckNetIsolation.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList 'LoopbackExempt','-a','-n=${before.family}'; exit $p.ExitCode } catch { exit 1223 }`;
    const result = await this.runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(launcher)], 180_000);
    if (result.code === 1223) throw new MeldLoopbackError(409, 'Windows did not get permission. Press the button again and choose Yes on the Windows prompt.');
    const after = await this.status();
    if (!after.allowed) throw new MeldLoopbackError(500, 'Windows did not take the change. Try again, or follow the steps in Troubleshooting.');
    return { supported: true, installed: true, allowed: true };
  }
}
