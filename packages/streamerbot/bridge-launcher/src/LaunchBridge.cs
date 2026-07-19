// Purpose: Starts THSV StreamBridge from either the managed Windows installation or a source checkout.
// Edit the Set Argument sub-action above this code to use a custom install folder.
// References: mscorlib.dll and System.dll (standard .NET Framework references bundled with Windows).
using System;
using System.Diagnostics;
using System.IO;

public class CPHInline
{
    private const string InstallPathArgument = "thsvBridgeInstallPath";

    public bool Execute()
    {
        string installPath;
        if (!TryResolveInstallPath(out installPath)) return false;

        // Prefer the self-contained public launcher; retain source-checkout support for developers.
        string managedNode = Path.Combine(installPath, "runtime", "node.exe");
        string managedLauncher = Path.Combine(installPath, "launcher", "start.mjs");
        string sourceScript = Path.Combine(installPath, "scripts", "start.ps1");
        ProcessStartInfo startInfo;
        if (File.Exists(managedNode) && File.Exists(managedLauncher))
        {
            startInfo = HiddenProcess(managedNode, "\"" + managedLauncher + "\" --wait", installPath);
        }
        else if (File.Exists(sourceScript))
        {
            startInfo = HiddenProcess("powershell.exe", "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + sourceScript + "\"", installPath);
        }
        else
        {
            CPH.LogError("THSV StreamBridge launch skipped: no managed launcher or source startup script exists in the selected install folder.");
            return false;
        }

        try
        {
            Process process = Process.Start(startInfo);
            if (process == null) return Fail("PowerShell or the bundled runtime did not start.");
            CPH.LogInfo("THSV StreamBridge launch requested through its validated lifecycle launcher.");
            return true;
        }
        catch (Exception exception)
        {
            return Fail("launcher failed (" + exception.GetType().Name + ").");
        }
    }

    // Resolve the editable action argument first, then preserve the legacy global as a migration fallback.
    private bool TryResolveInstallPath(out string installPath)
    {
        string configured;
        bool hasArgument = CPH.TryGetArg(InstallPathArgument, out configured) && !String.IsNullOrWhiteSpace(configured);
        if (!hasArgument)
        {
            string legacy = CPH.GetGlobalVar<string>(InstallPathArgument, true);
            configured = String.IsNullOrWhiteSpace(legacy)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "THSV StreamBridge")
                : legacy;
        }
        try
        {
            installPath = Path.GetFullPath(Environment.ExpandEnvironmentVariables(configured.Trim()));
            return true;
        }
        catch (Exception exception)
        {
            installPath = String.Empty;
            return Fail("install path is invalid (" + exception.GetType().Name + ").");
        }
    }

    private static ProcessStartInfo HiddenProcess(string fileName, string arguments, string workingDirectory)
    {
        return new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
    }

    private bool Fail(string reason)
    {
        CPH.LogError("THSV StreamBridge launch failed: " + reason);
        return false;
    }
}
