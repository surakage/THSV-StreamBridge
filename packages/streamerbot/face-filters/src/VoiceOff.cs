// Purpose: Turns the Voicemod voice changer off when a Face Filters lens with a voice ends,
// for one broker-authorized request.
// References: mscorlib.dll and System.dll.
using System;

public class CPHInline
{
    public bool Execute()
    {
        object value;
        string token = CPH.TryGetArg("thsvAddonRelayToken", out value) && value != null ? Convert.ToString(value).Trim() : "";
        if (token.Length < 20)
        {
            CPH.SetArgument("faceFilterError", "The StreamBridge broker token was missing; run this action from StreamBridge only.");
            CPH.LogWarn("THSV Face Filters: Voice Off was run without a StreamBridge broker token.");
            return false;
        }
        CPH.VoiceModVoiceChangerOff();
        return true;
    }
}
