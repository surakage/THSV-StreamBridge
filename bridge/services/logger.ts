import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFields = Readonly<Record<string, unknown>>;

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY = /token|password|secret|cookie|authorization|rawPayload/i;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export class StructuredLogger implements Logger {
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly filePath: string;

  public constructor(
    private readonly minimumLevel: LogLevel,
    directory: string,
    private readonly maxFileBytes: number,
    private readonly backups: number,
  ) {
    this.filePath = resolve(directory, 'streambridge.log');
  }

  public debug(message: string, fields: LogFields = {}): void { this.log('debug', message, fields); }
  public info(message: string, fields: LogFields = {}): void { this.log('info', message, fields); }
  public warn(message: string, fields: LogFields = {}): void { this.log('warn', message, fields); }
  public error(message: string, fields: LogFields = {}): void { this.log('error', message, fields); }

  public async flush(): Promise<void> { await this.writeQueue; }

  private log(level: LogLevel, message: string, fields: LogFields): void {
    if (LEVELS[level] < LEVELS[this.minimumLevel]) return;
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...(sanitize(fields) as Record<string, unknown>) });
    const line = `${entry}\n`;
    process.stdout.write(line);
    this.writeQueue = this.writeQueue.then(() => this.writeLine(line)).catch((error: unknown) => {
      process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', message: 'Log file write failed', error: error instanceof Error ? error.message : String(error) })}\n`);
    });
  }

  private async writeLine(line: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const size = await stat(this.filePath).then((value) => value.size).catch(() => 0);
    if (size + Buffer.byteLength(line) > this.maxFileBytes) await this.rotate();
    await writeFile(this.filePath, line, { encoding: 'utf8', flag: 'a', mode: 0o600 });
  }

  private async rotate(): Promise<void> {
    for (let index = this.backups; index >= 1; index -= 1) {
      const source = index === 1 ? this.filePath : `${this.filePath}.${String(index - 1)}`;
      const destination = `${this.filePath}.${String(index)}`;
      await rm(destination, { force: true });
      await rename(source, destination).catch(() => undefined);
    }
  }
}

function sanitize(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)]));
  }
  return value;
}
