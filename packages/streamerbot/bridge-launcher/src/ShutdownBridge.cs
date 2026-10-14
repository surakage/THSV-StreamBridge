// Purpose: Stops THSV StreamBridge through its authenticated managed launcher or source lifecycle script.
// Leave the thsvBridgeInstallPath Set Argument above this code blank to find the install
// automatically; type a folder there only to force a different install.
// References: mscorlib.dll and System.dll (standard .NET Framework references bundled with Windows).
using System;
using System.Diagnostics;
using System.IO;

public class CPHInline
{
    private const string InstallPathArgument = "thsvBridgeInstallPath";
    // One shared toast id across all THSV lifecycle actions: Windows stacks every
    // notification under a single Action Center header instead of piling up separately.
    private const string ToastId = "thsv-streambridge";

    public bool Execute()
    {
        string installPath;
        if (!TryResolveInstallPath(out installPath)) return false;

        // Use the managed launcher when installed; source checkouts retain the PowerShell path.
        string managedNode = Path.Combine(installPath, "runtime", "node.exe");
        string managedLauncher = Path.Combine(installPath, "launcher", "stop.mjs");
        string sourceScript = Path.Combine(installPath, "scripts", "stop.ps1");
        ProcessStartInfo startInfo;
        if (File.Exists(managedNode) && File.Exists(managedLauncher))
            startInfo = HiddenProcess(managedNode, "\"" + managedLauncher + "\"", installPath);
        else if (File.Exists(sourceScript))
            startInfo = HiddenProcess("powershell.exe", "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + sourceScript + "\"", installPath);
        else
            return Fail("no managed launcher or source shutdown script exists in the selected install folder.");

        try
        {
            Process process = Process.Start(startInfo);
            if (process == null) return Fail("PowerShell or the bundled runtime did not start.");
            // The launcher blocks until the bridge confirms it stopped or gives up; without
            // waiting here this action would report success the instant a process handle exists,
            // even if the authenticated shutdown then failed and the bridge kept running.
            if (!process.WaitForExit(ShutdownTimeoutMs)) return Fail("the launcher did not finish within the expected time.");
            if (process.ExitCode != 0) return Fail("the launcher reported a failure (exit code " + process.ExitCode + ").");
            CPH.LogInfo("THSV StreamBridge shutdown completed through its authenticated lifecycle launcher.");
            Notify("Bridge stopped.");
            return true;
        }
        catch (Exception exception)
        {
            return Fail("launcher failed (" + exception.GetType().Name + ").");
        }
    }

    private const int ShutdownTimeoutMs = 20_000;

    // Resolution order:
    //   1. an explicit thsvBridgeInstallPath argument that names a real installation;
    //   2. install-location.txt, which StreamBridge rewrites every time it starts and the
    //      installer writes on install and update;
    //   3. the explicit argument as typed, then the legacy global variable, then the default folder.
    // A blank argument, "auto", or the old shipped default "%LOCALAPPDATA%\THSV StreamBridge"
    // all mean "find it automatically", so a re-import that resets the argument cannot break this.
    private bool TryResolveInstallPath(out string installPath)
    {
        try
        {
            string configured;
            string explicitPath = String.Empty;
            if (CPH.TryGetArg(InstallPathArgument, out configured) && !IsAutomaticInstallPath(configured))
            {
                explicitPath = Path.GetFullPath(Environment.ExpandEnvironmentVariables(configured.Trim()));
                if (LooksInstalled(explicitPath))
                {
                    installPath = explicitPath;
                    return true;
                }
            }
            string remembered;
            if (TryReadRememberedInstall(out remembered))
            {
                if (explicitPath.Length > 0) CPH.LogInfo("THSV StreamBridge is using its recorded install folder because the configured folder has no installation.");
                installPath = remembered;
                return true;
            }
            if (explicitPath.Length > 0)
            {
                installPath = explicitPath;
                return true;
            }
            string legacy = CPH.GetGlobalVar<string>(InstallPathArgument, true);
            installPath = Path.GetFullPath(Environment.ExpandEnvironmentVariables(IsAutomaticInstallPath(legacy) ? DefaultInstallFolder : legacy.Trim()));
            return true;
        }
        catch (Exception exception)
        {
            installPath = String.Empty;
            return Fail("install path is invalid (" + exception.GetType().Name + ").");
        }
    }

    private const string DefaultInstallFolder = "%LOCALAPPDATA%\\THSV StreamBridge";

    private static bool IsAutomaticInstallPath(string value)
    {
        if (String.IsNullOrWhiteSpace(value)) return true;
        string trimmed = value.Trim().TrimEnd('\\', '/');
        return String.Equals(trimmed, "auto", StringComparison.OrdinalIgnoreCase)
            || String.Equals(trimmed, DefaultInstallFolder, StringComparison.OrdinalIgnoreCase);
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

    // Every invocation raises exactly one toast — success and failure paths are exclusive,
    // and the shared id keeps repeats grouped, so this action can never flood Action Center.
    private void Notify(string message)
    {
        CPH.ShowToastNotification(ToastId, "THSV StreamBridge", message, "THSV StreamBridge", null);
    }

    private static string RememberedInstallFile()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "THSV StreamBridge", "install-location.txt");
    }

    private static bool LooksInstalled(string folder)
    {
        return (File.Exists(Path.Combine(folder, "runtime", "node.exe")) && File.Exists(Path.Combine(folder, "launcher", "start.mjs")))
            || File.Exists(Path.Combine(folder, "scripts", "start.ps1"));
    }

    private static bool TryReadRememberedInstall(out string folder)
    {
        folder = String.Empty;
        try
        {
            string path = RememberedInstallFile();
            if (!File.Exists(path)) return false;
            string line;
            using (StreamReader reader = new StreamReader(path)) line = reader.ReadLine() ?? String.Empty;
            string candidate = Path.GetFullPath(line.Trim());
            if (!LooksInstalled(candidate)) return false;
            folder = candidate;
            return true;
        }
        catch { return false; }
    }

    private bool Fail(string reason)
    {
        CPH.LogError("THSV StreamBridge shutdown failed: " + reason);
        Notify("Bridge shutdown failed: " + reason);
        return false;
    }
}
