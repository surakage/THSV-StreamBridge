import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Windows release signing', () => {
  it('keeps certificate material optional, ephemeral, and before manifest hashing', async () => {
    const signing = await readFile('scripts/sign-windows-release.ps1', 'utf8');
    const packaging = await readFile('scripts/package-release.ps1', 'utf8');
    const workflow = await readFile('.github/workflows/release.yml', 'utf8');
    expect(signing).toContain('Get-AuthenticodeSignature');
    expect(signing).toContain('Set-AuthenticodeSignature');
    expect(signing).toContain('Import-Module Microsoft.PowerShell.Security -ErrorAction Stop');
    expect(signing).toContain("Status = 'Unavailable'");
    expect(signing).toContain('$RequireValidRuntime -or -not [string]::IsNullOrWhiteSpace($CertificatePath)');
    expect(signing).toContain('EphemeralKeySet');
    expect(signing).toContain('Code Signing');
    expect(packaging.indexOf('sign-windows-release.ps1')).toBeLessThan(packaging.indexOf('$releaseFiles = @('));
    expect(packaging).toContain('authenticodeStatus');
    expect(workflow).toContain('WINDOWS_SIGNING_CERTIFICATE_BASE64');
    expect(workflow).toContain("Join-Path $env:RUNNER_TEMP 'streambridge-signing.pfx'");
    expect(workflow).toContain('Remove the temporary Windows signing identity');
  });
});
