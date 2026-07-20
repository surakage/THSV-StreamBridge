# Verifying a THSV StreamBridge release

Download THSV StreamBridge only from the official GitHub Releases page:

https://github.com/surakage/THSV-StreamBridge/releases

Every public release includes the portable Windows ZIP, a `.sha256` checksum, a CycloneDX software bill of materials, and GitHub build-provenance attestations.

Verify the publisher and build provenance with GitHub CLI:

```powershell
gh attestation verify .\THSV-StreamBridge-2.x.x.zip --repo surakage/THSV-StreamBridge
```

Verify the downloaded bytes against the adjacent checksum:

```powershell
Get-FileHash -Algorithm SHA256 .\THSV-StreamBridge-2.x.x.zip
Get-Content .\THSV-StreamBridge-2.x.x.zip.sha256
```

The project does not claim that an unsigned archive will never trigger Microsoft Defender SmartScreen or antivirus reputation warnings. GitHub attestations establish which repository and workflow produced the archive; they are not a substitute for reviewing software permissions and release notes.
