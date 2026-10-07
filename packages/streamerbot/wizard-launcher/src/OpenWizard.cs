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
                // Shell execution keeps a newly opened browser from inheriting
                // Streamer.bot's WebSocket and Stream Deck listening sockets.
                UseShellExecute = true,
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
            // Re-importing this package resets the argument to its default, so fall back to the
            // folder remembered by the last successful launch when the argument has no install.
            string remembered;
            if (!LooksInstalled(installPath) && TryReadRememberedInstall(out remembered))
            {
                CPH.LogInfo("THSV StreamBridge is using its remembered install folder because the configured folder has no installation.");
                installPath = remembered;
            }
            return true;
        }
        catch (Exception exception)
        {
            installPath = String.Empty;
            return Fail("install path is invalid (" + exception.GetType().Name + ").");
        }
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
        CPH.LogError("Unable to open the THSV StreamBridge setup wizard: " + reason);
        return false;
    }
}
