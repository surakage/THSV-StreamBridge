// Purpose: Starts THSV StreamBridge from either the managed Windows installation or a source checkout.
// Edit the Set Argument sub-action above this code to use a custom install folder.
// References: mscorlib.dll and System.dll (standard .NET Framework references bundled with Windows).
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;

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
            // The launcher itself blocks until the bridge reports healthy or gives up; without
            // waiting here this action would report success the instant a process handle exists,
            // even if the bridge then failed its own health check and exited.
            if (!process.WaitForExit(LaunchTimeoutMs)) return Fail("the launcher did not finish within the expected time.");
            if (process.ExitCode != 0) return Fail("the launcher reported a failure (exit code " + process.ExitCode + ").");
            CPH.LogInfo("THSV StreamBridge launch completed through its validated lifecycle launcher.");
            RememberInstall(installPath);
            return ReportReadiness();
        }
        catch (Exception exception)
        {
            return Fail("launcher failed (" + exception.GetType().Name + ").");
        }
    }

    private const int LaunchTimeoutMs = 30_000;
    private const int HealthTimeoutMs = 5_000;
    private const string HealthUrl = "http://127.0.0.1:8787/ready";

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

    // Shell execution keeps the launcher from inheriting Streamer.bot's handles. Without
    // it the long-lived bridge inherited Streamer.bot's WebSocket and Stream Deck
    // listening sockets, so a restarted Streamer.bot could not bind them.
    private static ProcessStartInfo HiddenProcess(string fileName, string arguments, string workingDirectory)
    {
        return new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Hidden,
        };
    }

    // The bridge connects to Streamer.bot only after it starts listening, so a
    // first "not ready" answer is expected; retry briefly before reporting failure.
    private const int ReadinessWindowMs = 15_000;
    private const int ReadinessRetryDelayMs = 1_000;

    private bool ReportReadiness()
    {
        DateTime deadline = DateTime.UtcNow.AddMilliseconds(ReadinessWindowMs);
        string lastProblem;
        do
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(HealthUrl);
                request.Method = "GET";
                request.Timeout = HealthTimeoutMs;
                request.ReadWriteTimeout = HealthTimeoutMs;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    string body = reader.ReadToEnd();
                    if (Regex.IsMatch(body, "\\\"ready\\\"\\s*:\\s*true", RegexOptions.IgnoreCase))
                    {
                        CPH.LogInfo("THSV StreamBridge readiness check passed: bridge, adapters, Streamer.bot delivery, and modules are healthy.");
                        Notify("Status: GREEN - bridge, platforms, delivery, and modules are connected." + OptionalApplicationStatus());
                        return true;
                    }
                    lastProblem = "the bridge started but its readiness check did not pass.";
                }
            }
            catch (WebException exception)
            {
                lastProblem = "the bridge started but readiness is unavailable (" + exception.Status + ").";
            }
            catch (Exception exception)
            {
                return Fail("the bridge started but readiness could not be checked (" + exception.GetType().Name + ").");
            }
            if (DateTime.UtcNow.AddMilliseconds(ReadinessRetryDelayMs) >= deadline) break;
            System.Threading.Thread.Sleep(ReadinessRetryDelayMs);
        }
        while (true);
        return Fail(lastProblem);
    }

    // Every invocation raises exactly one toast — success and failure paths are exclusive,
    // and the shared id keeps repeats grouped, so this action can never flood Action Center.
    private string OptionalApplicationStatus()
    {
        string obsState;
        try { obsState = CPH.ObsIsConnected() ? "connected" : "not connected"; }
        catch (Exception exception) { obsState = "check unavailable (" + exception.GetType().Name + ")"; }
        bool speakerRunning = LocalProcessIsRunning("Speaker.bot") || LocalProcessIsRunning("SpeakerBot");
        return " Optional apps: OBS " + obsState + "; Speaker.bot "
            + (speakerRunning ? "local process running" : "local process not detected") + ".";
    }

    private static bool LocalProcessIsRunning(string processName)
    {
        try
        {
            Process[] processes = Process.GetProcessesByName(processName);
            bool running = processes.Length > 0;
            foreach (Process process in processes) process.Dispose();
            return running;
        }
        catch { return false; }
    }

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

    private static void RememberInstall(string folder)
    {
        try
        {
            string path = RememberedInstallFile();
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, folder);
        }
        catch { }
    }

    private bool Fail(string reason)
    {
        CPH.LogError("THSV StreamBridge launch failed: " + reason);
        Notify("Bridge launch failed: " + reason);
        return false;
    }
}
