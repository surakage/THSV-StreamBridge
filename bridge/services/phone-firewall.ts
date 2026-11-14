import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Windows Firewall for the Phone Control Panel. StreamBridge runs in the background, so Windows often never shows
// its "allow on private networks" prompt and quietly blocks phones instead. This checks for one inbound rule for the
// phone port (only from the home network), or Windows' own allow entry for this copy of Node.js, and, when the creator presses the button, adds it through the normal
// Windows administrator prompt. It also removes Windows' own "block" entries for this copy of StreamBridge's Node.js,
// which win over any allow rule. Nothing else in the firewall is read or changed.

export const PHONE_FIREWALL_RULE = 'THSV StreamBridge Phone Control Panel';

export interface PhoneFirewallStatus { readonly supported: boolean; readonly allowed: boolean; readonly blocked: boolean }
export type PhoneFirewallRunner = (file: string, args: readonly string[], timeoutMs: number) => Promise<{ readonly code: number; readonly stdout: string }>;

export class PhoneFirewallError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

const execFileAsync = promisify(execFile);
const defaultRunner: PhoneFirewallRunner = async (file, args, timeoutMs) => {
  try { const { stdout } = await execFileAsync(file, [...args], { encoding: 'utf8', windowsHide: true, timeout: timeoutMs }); return { code: 0, stdout }; }
  catch (error) { const failure = error as { code?: unknown; stdout?: unknown }; return { code: typeof failure.code === 'number' ? failure.code : -1, stdout: typeof failure.stdout === 'string' ? failure.stdout : '' }; }
};

const quote = (value: string): string => `'${value.replace(/'/gu, "''")}'`;
const encode = (script: string): string => Buffer.from(script, 'utf16le').toString('base64');

export class PhoneFirewall {
  public constructor(
    private readonly port: number,
    private readonly program: string = process.execPath,
    private readonly runner: PhoneFirewallRunner = defaultRunner,
    private readonly supported = process.platform === 'win32',
  ) {}

  /** Reading the firewall needs no administrator rights. */
  public async status(): Promise<PhoneFirewallStatus> {
    if (!this.supported) return { supported: false, allowed: true, blocked: false };
    const script = [
      `$rule = @(Get-NetFirewallRule -DisplayName ${quote(PHONE_FIREWALL_RULE)} -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Allow' } | Where-Object { @(($_ | Get-NetFirewallPortFilter).LocalPort) -contains ${quote(String(this.port))} }).Count`,
      `$rule += @(Get-NetFirewallApplicationFilter -Program ${quote(this.program)} -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' -and $_.Enabled -eq 'True' }).Count`,
      `$blocks = @(Get-NetFirewallApplicationFilter -Program ${quote(this.program)} -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' -and $_.Enabled -eq 'True' }).Count`,
      'Write-Output "rule=$rule blocks=$blocks"',
    ].join('\n');
    const result = await this.runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(script)], 20_000);
    const match = /rule=(\d+) blocks=(\d+)/u.exec(result.stdout);
    if (result.code !== 0 || match === null) return { supported: true, allowed: false, blocked: false };
    const blocked = Number(match[2]) > 0;
    return { supported: true, allowed: Number(match[1]) > 0 && !blocked, blocked };
  }

  /** Adds the rule through the Windows administrator prompt, which the creator must accept on this PC. */
  public async allow(): Promise<PhoneFirewallStatus> {
    if (!this.supported) throw new PhoneFirewallError(400, 'This only applies to Windows.');
    const elevated = [
      "$ErrorActionPreference = 'Stop'",
      `Get-NetFirewallRule -DisplayName ${quote(PHONE_FIREWALL_RULE)} -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
      `Get-NetFirewallApplicationFilter -Program ${quote(this.program)} -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' } | Remove-NetFirewallRule`,
      `New-NetFirewallRule -DisplayName ${quote(PHONE_FIREWALL_RULE)} -Description 'Lets paired phones on your home network open the StreamBridge Control Panel.' -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${String(this.port)} -RemoteAddress LocalSubnet -Profile Any | Out-Null`,
    ].join('\n');
    const launcher = `try { $p = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${encode(elevated)}'; exit $p.ExitCode } catch { exit 1223 }`;
    const result = await this.runner('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(launcher)], 180_000);
    if (result.code === 1223) throw new PhoneFirewallError(409, 'Windows did not get permission. Press the button again and choose Yes on the Windows prompt.');
    if (result.code !== 0) throw new PhoneFirewallError(500, 'Windows Firewall did not take the change. Try again.');
    const status = await this.status();
    if (!status.allowed) throw new PhoneFirewallError(500, 'Windows Firewall did not take the change. Try again.');
    return status;
  }
}
