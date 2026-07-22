// Purpose: Opens the authenticated local THSV StreamBridge setup wizard through the installed launcher.
// Edit the Set Argument sub-action above this code to use a custom install folder.
// Security: the launcher reads the configured port, verifies THSV health on loopback, then opens the wizard.
// References: mscorlib.dll and System.dll; no third-party compiler references are required.
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
        string node = Path.Combine(installPath, "runtime", "node.exe");
        string launcher = Path.Combine(installPath, "launcher", "open-wizard.mjs");
        if (!File.Exists(node) || !File.Exists(launcher)) return Fail("the managed wizard launcher is missing; reinstall THSV StreamBridge.");

        try
        {
            Process process = Process.Start(new ProcessStartInfo
            {
                FileName = node,
                Arguments = "\"" + launcher + "\"",
                WorkingDirectory = installPath,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });
            if (process == null || !process.WaitForExit(10_000) || process.ExitCode != 0) return Fail("the launcher could not verify and open the local wizard.");
            CPH.LogInfo("Opened the local THSV StreamBridge setup wizard. The wizard requires local authentication.");
            return true;
        }
        catch (Exception exception)
        {
            return Fail("launcher failed (" + exception.GetType().Name + ").");
        }
    }

    private bool TryResolveInstallPath(out string installPath)
    {
        string configured;
        if (!CPH.TryGetArg(InstallPathArgument, out configured) || String.IsNullOrWhiteSpace(configured))
            configured = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "THSV StreamBridge");
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

    private bool Fail(string reason)
    {
        CPH.LogError("Unable to open the THSV StreamBridge setup wizard: " + reason);
        return false;
    }
}
