// Purpose: Checks one broker-authorized Face Filters request before the Streamfog
// "Activate Lens by Name" sub-action that follows it reads %faceFilterLensName% and
// %faceFilterDuration%. Returning false stops the action, so nothing reaches Streamfog.
// References: mscorlib.dll and System.dll.
using System;

public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 100);
        string lens = Read("faceFilterLensName", 100);
        string duration = Read("faceFilterDuration", 4);
        int seconds;
        if (token.Length < 20) return Fail("The StreamBridge broker token was missing; run this action from StreamBridge only.");
        if (lens.Length == 0) return Fail("No Streamfog lens name was supplied.");
        if (!int.TryParse(duration, out seconds) || seconds < 5 || seconds > 600) return Fail("The lens duration must be 5-600 seconds.");
        CPH.SetArgument("faceFilterLensName", lens);
        CPH.SetArgument("faceFilterDuration", seconds.ToString());
        return true;
    }

    private string Read(string name, int maximum)
    {
        object value;
        string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value).Trim() : "";
        text = text.Replace("\r", " ").Replace("\n", " ").Replace("%", "");
        return text.Length <= maximum ? text : text.Substring(0, maximum);
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("faceFilterError", reason);
        CPH.LogWarn("THSV Face Filters: " + reason);
        return false;
    }
}
