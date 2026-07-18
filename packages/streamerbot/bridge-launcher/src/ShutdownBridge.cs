using System;
using System.IO;
using System.Net;

public class CPHInline
{
    // Requests a graceful shutdown of the bridge via its own documented /shutdown endpoint,
    // authenticated with the same control token the wizard itself uses. The token is read
    // fresh from data/runtime/control-token under the install path every time this runs, so it
    // stays correct even if the token is ever regenerated - never copy it into an argument or
    // global variable by hand. Bind this to your platform's own "stream offline/ended" trigger.
    private const string InstallPathVariable = "thsvBridgeInstallPath";
    private const string DefaultPort = "8787";

    public bool Execute()
    {
        string installPath = CPH.GetGlobalVar<string>(InstallPathVariable, true);
        if (string.IsNullOrWhiteSpace(installPath))
        {
            CPH.LogError("THSV StreamBridge shutdown skipped: set the '" + InstallPathVariable + "' global variable to your StreamBridge install folder first.");
            return false;
        }

        string tokenPath = Path.Combine(installPath, "data", "runtime", "control-token");
        string token;
        try
        {
            token = File.ReadAllText(tokenPath).Trim();
        }
        catch (Exception exception)
        {
            CPH.LogError("THSV StreamBridge shutdown skipped: could not read the control token at " + tokenPath + ": " + exception.Message);
            return false;
        }

        try
        {
            using (WebClient client = new WebClient())
            {
                client.Headers.Add("authorization", "Bearer " + token);
                client.UploadString("http://127.0.0.1:" + DefaultPort + "/shutdown", "POST", "");
            }
            CPH.LogInfo("THSV StreamBridge shutdown requested.");
        }
        catch (Exception exception)
        {
            // Most likely just means the bridge was not running - "make sure it is stopped" is
            // inherently idempotent, so this is worth logging but not worth failing loudly over.
            CPH.LogInfo("THSV StreamBridge shutdown request did not reach the bridge (it may already be stopped): " + exception.Message);
        }

        return true;
    }
}
