using System;
using System.Diagnostics;

public class CPHInline
{
    private const string WizardUrl = "http://127.0.0.1:8787/wizard/";

    public bool Execute()
    {
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
            CPH.LogError("Unable to open the THSV StreamBridge setup wizard: " + exception.Message);
            return false;
        }
    }
}
