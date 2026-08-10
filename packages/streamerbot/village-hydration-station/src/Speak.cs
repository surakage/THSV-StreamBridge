// Purpose: Sends one broker-authorized creator-authored hydration phrase to Speaker.bot.
// References: mscorlib.dll, System.dll, and netstandard.dll.
using System;

public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 100);
        string voice = Read("hydrationVoiceAlias", 80);
        string message = Read("hydrationSpeechMessage", 400);
        if (token.Length < 20 || message.Length == 0) return Fail("The broker token or hydration phrase was missing.");
        if (voice.Length == 0) return Fail("Create a Speaker.bot Voice Alias and enter that exact alias in the StreamBridge wizard.");
        try
        {
            int requestId = CPH.TtsSpeak(voice, message, true);
            CPH.SetArgument("hydrationSpeechRequestId", requestId);
            CPH.SetArgument("hydrationSpeechSuccess", requestId >= 0);
            return requestId >= 0;
        }
        catch (Exception error) { return Fail("Speaker.bot request failed (" + error.GetType().Name + ")."); }
    }

    private string Read(string name, int maximum)
    {
        object value;
        string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value).Trim() : "";
        text = text.Replace("\r", " ").Replace("\n", " ");
        return text.Length <= maximum ? text : text.Substring(0, maximum);
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("hydrationSpeechSuccess", false);
        CPH.SetArgument("hydrationSpeechError", reason);
        CPH.LogWarn("THSV Village Hydration Station speech failed without logging speech content.");
        return false;
    }
}
