// Purpose: Opens the THSV StreamBridge Control Deck (one window with a tab per extension) through the
// installed launcher, already unlocked. Set controlDeckTab to an extension ID such as thsv.prize-wheel
// to open on that tab; leave it blank to open the last tab used.
// Leave the thsvBridgeInstallPath Set Argument above this code blank to find the install
// automatically; type a folder there only to force a different install.
// Security: the launcher reads the configured port, verifies THSV health on loopback, then opens
// http://127.0.0.1:<port>/wizard/control-deck with a one-use unlock link.
// References: mscorlib.dll and System.dll; no third-party compiler references are required.
using System;
using System.Diagnostics;
using System.IO;
using System.Text.RegularExpressions;

public class CPHInline
{
    private const string InstallPathArgument = "thsvBridgeInstallPath";
    private const string TabArgument = "controlDeckTab";
    private static readonly Regex TabPattern = new Regex("^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)+$");

    public bool Execute()
    {
        string installPath;
        if (!TryResolveInstallPath(out installPath)) return false;
        string node = Path.Combine(installPath, "runtime", "node.exe");
        string launcher = Path.Combine(installPath, "launcher", "open-wizard.mjs");
        if (!File.Exists(node) || !File.Exists(launcher)) return Fail("the managed wizard launcher is missing; reinstall THSV StreamBridge.");
        string tab;
        string tabOption = String.Empty;
        if (CPH.TryGetArg(TabArgument, out tab) && !String.IsNullOrWhiteSpace(tab))
        {
            tab = tab.Trim().ToLowerInvariant();
            if (tab.Length > 100 || !TabPattern.IsMatch(tab)) return Fail("controlDeckTab must be an extension ID such as thsv.prize-wheel, or blank.");
            tabOption = " --tab=" + tab;
        }

        try
        {
            Process process = Process.Start(new ProcessStartInfo
            {
                FileName = node,
                Arguments = "\"" + launcher + "\" --page=control-deck" + tabOption,
                WorkingDirectory = installPath,
                // Shell execution keeps a newly opened browser from inheriting
                // Streamer.bot's WebSocket and Stream Deck listening sockets.
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Hidden
            });
            if (process == null || !process.WaitForExit(10_000) || process.ExitCode != 0) return Fail("the launcher could not verify and open the Control Deck.");
            CPH.LogInfo("Opened the THSV StreamBridge Control Deck.");
            return true;
        }
        catch (Exception exception)
        {
            return Fail("launcher failed (" + exception.GetType().Name + ").");
        }
    }

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
        CPH.LogError("Unable to open the THSV StreamBridge Control Deck: " + reason);
        return false;
    }
}
