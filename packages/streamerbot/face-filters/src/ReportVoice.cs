// Purpose: Sends the ID of the voice currently selected in Voicemod back to StreamBridge, so a
// moderator can paste it into a lens's Voicemod voice box. Voicemod voices are selected by ID.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        object value;
        string token = CPH.TryGetArg("thsvAddonRelayToken", out value) && value != null ? Convert.ToString(value).Trim() : "";
        if (token.Length < 20) return Fail("The StreamBridge broker token was missing; run this action from StreamBridge only.");
        string voiceId = "";
        try { voiceId = (CPH.VoiceModGetCurrentVoice() ?? "").Trim(); }
        catch (Exception exception) { return Fail("Voicemod did not answer (" + exception.GetType().Name + "). Is it connected in Streamer.bot?"); }
        if (voiceId.Length > 120) voiceId = voiceId.Substring(0, 120);
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.face-filters", ["eventType"] = "addon.thsv.face-filters.voice-current",
            ["sourceEventType"] = "THSV Extension - Face Filters - Report Voice", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false,
            ["payload"] = new JObject { ["voiceId"] = voiceId }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception exception) { return Fail("The voice ID could not be sent to StreamBridge (" + exception.GetType().Name + ")."); }
        return true;
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("faceFilterError", reason);
        CPH.LogWarn("THSV Face Filters: " + reason);
        return false;
    }
}
