import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

// Start with Windows: an optional entry in the signed-in person's own "Run" list that opens the tray icon
// and starts StreamBridge when they sign in. It is off until the creator turns it on in the Wizard, needs
// no administrator rights, and only ever touches the one value named below.

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
export const SIGN_IN_START_VALUE = 'THSV StreamBridge';
/** Windows ignores Run entries longer than this. */
const MAXIMUM_COMMAND_LENGTH = 259;

export interface SignInStartStatus { readonly supported: boolean; readonly enabled: boolean }
export type SignInStartRunner = (file: string, args: readonly string[]) => Promise<string>;

export class SignInStartError extends Error {
  public constructor(public readonly statusCode: number, message: string) { super(message); }
}

const execFileAsync = promisify(execFile);
const defaultRunner: SignInStartRunner = async (file, args) => (await execFileAsync(file, [...args], { encoding: 'utf8', windowsHide: true, timeout: 10_000 })).stdout;

export class SignInStartService {
  public constructor(
    private readonly installRoot: string,
    private readonly runner: SignInStartRunner = defaultRunner,
    private readonly supported = process.platform === 'win32',
  ) {}

  /** The exact line Windows runs at sign-in. The tray works out its own folder, which keeps the line short. */
  public command(): string {
    return `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${join(this.installRoot, 'launcher', 'tray.ps1')}" -StartBridge`;
  }

  public async status(): Promise<SignInStartStatus> {
    if (!this.supported) return { supported: false, enabled: false };
    let output: string;
    try { output = await this.runner('reg.exe', ['query', RUN_KEY, '/v', SIGN_IN_START_VALUE]); }
    catch { return { supported: true, enabled: false }; } // reg.exe fails when the value is not there.
    // Only "on" when the entry starts this copy of StreamBridge, not an older one in another folder.
    return { supported: true, enabled: output.toLowerCase().includes(this.command().toLowerCase()) };
  }

  public async setEnabled(enabled: boolean): Promise<SignInStartStatus> {
    if (!this.supported) throw new SignInStartError(400, 'Starting with Windows only works on a Windows PC.');
    if (enabled) {
      const command = this.command();
      if (command.length > MAXIMUM_COMMAND_LENGTH) throw new SignInStartError(400, 'The StreamBridge folder name is too long for Windows to start it at sign-in. Move StreamBridge to a shorter folder and try again.');
      try { await this.runner('reg.exe', ['add', RUN_KEY, '/v', SIGN_IN_START_VALUE, '/t', 'REG_SZ', '/d', command, '/f']); }
      catch { throw new SignInStartError(500, 'Windows did not save the setting. Try again.'); }
    } else {
      try { await this.runner('reg.exe', ['delete', RUN_KEY, '/v', SIGN_IN_START_VALUE, '/f']); }
      catch { /* Already gone: checked below. */ }
    }
    const status = await this.status();
    if (status.enabled !== enabled) throw new SignInStartError(500, 'Windows did not save the setting. Try again.');
    return status;
  }
}
