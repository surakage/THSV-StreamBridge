using System;
using System.Diagnostics;

public class CPHInline
{
    // Launches the THSV StreamBridge bridge process if it is not already running. Bind this
    // action to Streamer.bot's own "Streamer.bot Started" trigger yourself (Add > find it in
    // your trigger list - the exact category/wording varies by build) so the bridge comes up
    // automatically whenever Streamer.bot does. This package does not attempt to add that
    // trigger itself: no confirmed schema for it was found anywhere in Streamer.bot's public
    // documentation, and picking it from Streamer.bot's own trigger list needs no guess at all.
    //
    // Set the "thsvBridgeInstallPath" global variable to your StreamBridge checkout or install
    // folder (Streamer.bot > Global Variables) before enabling this action. No code edit is
    // needed to point this at a different machine or folder.
    //
    // No "is it already running?" check: if the bridge is already up, the new process's own
    // HTTP server just fails to bind the port and exits - harmless, the running instance is
    // untouched.
    private const string InstallPathVariable = "thsvBridgeInstallPath";

    public bool Execute()
    {
        string installPath = CPH.GetGlobalVar<string>(InstallPathVariable, true);
        if (string.IsNullOrWhiteSpace(installPath))
        {
            CPH.LogError("THSV StreamBridge launch skipped: set the '" + InstallPathVariable + "' global variable to your StreamBridge install folder first.");
            return false;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c npm run dev",
                WorkingDirectory = installPath,
                UseShellExecute = true,
                CreateNoWindow = false,
            });
            CPH.LogInfo("THSV StreamBridge launch requested from " + installPath);
            return true;
        }
        catch (Exception exception)
        {
            CPH.LogError("Failed to launch THSV StreamBridge: " + exception.Message);
            return false;
        }
    }
}
