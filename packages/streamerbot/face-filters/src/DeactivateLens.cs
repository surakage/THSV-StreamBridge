// Purpose: Checks one broker-authorized Face Filters request before the Streamfog
// "Deactivate Lens" sub-action that follows it turns the current lens off. Streamfog ignores
// the Activate Lens duration, so StreamBridge runs this when each lens's time is up.
// References: mscorlib.dll and System.dll.
using System;

public class CPHInline
{
    public bool Execute()
    {
        object value;
        string token = CPH.TryGetArg("thsvAddonRelayToken", out value) && value != null ? Convert.ToString(value).Trim() : "";
        if (token.Length >= 20) return true;
        CPH.SetArgument("faceFilterError", "The StreamBridge broker token was missing; run this action from StreamBridge only.");
        CPH.LogWarn("THSV Face Filters: Deactivate Lens was run without a StreamBridge broker token.");
        return false;
    }
}
