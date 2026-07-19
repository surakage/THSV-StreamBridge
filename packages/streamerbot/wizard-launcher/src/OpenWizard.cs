// Purpose: Opens the authenticated local THSV StreamBridge setup wizard in the default browser.
// Security: opens only the fixed loopback URL and does not read or expose local credentials.
// References: mscorlib.dll and System.dll; no third-party compiler references are required.
using System;
using System.Diagnostics;

public class CPHInline
{
    private const string WizardUrl = "http://127.0.0.1:8787/wizard/";

    public bool Execute()
    {
        // Use the Windows shell only for the fixed localhost URL.
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = WizardUrl,
                UseShellExecute = true
            });
            CPH.LogInfo("Opened the local THSV StreamBridge setup wizard. The wizard requires local authentication.");
            return true;
        }
        catch (Exception exception)
        {
            CPH.LogError("Unable to open the local THSV StreamBridge setup wizard (" + exception.GetType().Name + ").");
            return false;
        }
    }
}
