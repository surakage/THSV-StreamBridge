// Purpose: Switches Voicemod to one lens's voice and turns the voice changer on, for one
// broker-authorized Face Filters request. StreamBridge turns it off again when the lens ends.
// References: mscorlib.dll and System.dll.
using System;
using System.Text.RegularExpressions;

public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 100);
        string voiceId = Read("faceFilterVoiceId", 120);
        if (token.Length < 20) return Fail("The StreamBridge broker token was missing; run this action from StreamBridge only.");
        if (!Regex.IsMatch(voiceId, "^[A-Za-z0-9._-]{1,120}$")) return Fail("No valid Voicemod voice ID was supplied.");
        CPH.VoiceModSelectVoice(voiceId);
        CPH.VoiceModVoiceChangerOn();
        return true;
    }

    private string Read(string name, int maximum)
    {
        object value;
        string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value).Trim() : "";
        return text.Length <= maximum ? text : text.Substring(0, maximum);
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("faceFilterError", reason);
        CPH.LogWarn("THSV Face Filters: " + reason);
        return false;
    }
}
