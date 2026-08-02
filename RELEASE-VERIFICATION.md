# Verifying a THSV StreamBridge release

Download THSV StreamBridge only from the official GitHub Releases page:

https://github.com/surakage/THSV-StreamBridge/releases

Every public release includes the portable Windows ZIP, a `.sha256` checksum, a CycloneDX software bill of materials, and GitHub build-provenance attestations.

When a newer stable release is available, the authenticated setup wizard's **Download & verify** control performs both checks before writing the archive to the creator-private `data/updates` staging folder. It pins the official repository, exact versioned archive name, tagged `.github/workflows/release.yml` identity, SLSA v1 subject digest, download sizes, and SHA-256. It does not install, extract, restart, or replace the running bridge.

Official add-on updates use the same tagged-workflow provenance boundary. The wizard verifies the outer release ZIP against the official add-on index and GitHub attestation, safely extracts exactly one root `.thsv-addon`, verifies its adjacent checksum and package manifest, and confirms the module ID, version, publisher, and compatibility before placing it in `data/addons/inbox`. The creator must still review the discovered package and choose **Verify and install**; staging never installs, enables, or restarts an add-on.

Verify the publisher and build provenance with GitHub CLI:

```powershell
gh attestation verify .\THSV-StreamBridge-3.0.0.zip --repo surakage/THSV-StreamBridge
```

Verify the downloaded bytes against the adjacent checksum:

```powershell
Get-FileHash -Algorithm SHA256 .\THSV-StreamBridge-3.0.0.zip
Get-Content .\THSV-StreamBridge-3.0.0.zip.sha256
```

The project does not claim that an unsigned archive will never trigger Microsoft Defender SmartScreen or antivirus reputation warnings. GitHub attestations establish which repository and workflow produced the archive; they are not a substitute for reviewing software permissions and release notes.
