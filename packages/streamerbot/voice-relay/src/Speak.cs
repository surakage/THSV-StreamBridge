// Purpose: Sends one broker-authorized bounded phrase to Speaker.bot.
// References: mscorlib.dll, System.dll, netstandard.dll.
using System;
public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 100), voice = Read("voiceRelayVoiceAlias", 80), message = Read("voiceRelayMessage", 400);
        if (token.Length < 20 || message.Length == 0) return Fail("The broker token or bounded phrase was missing.");
        if (voice.Length == 0) return Fail("Create a Speaker.bot Voice Alias and enter that exact alias in the StreamBridge wizard.");
        try { int requestId = CPH.TtsSpeak(voice, message, true); CPH.SetArgument("voiceRelayRequestId", requestId); CPH.SetArgument("voiceRelaySuccess", requestId >= 0); return requestId >= 0; }
        catch (Exception error) { return Fail("Speaker.bot request failed (" + error.GetType().Name + ")."); }
    }
    private string Read(string key, int max) { object value; string text = CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : ""; return text.Length <= max ? text : text.Substring(0, max); }
    private bool Fail(string reason) { CPH.SetArgument("voiceRelaySuccess", false); CPH.SetArgument("voiceRelayError", reason); CPH.LogWarn("THSV Voice Relay request failed without logging speech content."); return false; }
}
