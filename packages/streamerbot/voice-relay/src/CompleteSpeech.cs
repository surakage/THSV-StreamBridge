// Purpose: Reports native Speaker.bot playback completion without speech content.
// References: mscorlib.dll, System.dll, Newtonsoft.Json.dll
using System;
using Newtonsoft.Json.Linq;
public class CPHInline
{
    public bool Execute()
    {
        string executionId, token;
        if (!CPH.TryGetArg("voiceRelayExecutionId", out executionId) || !CPH.TryGetArg("thsvAddonRelayToken", out token)) return false;
        bool prepared, success;
        double duration;
        bool completed = CPH.TryGetArg("voiceRelayPrepared", out prepared) && prepared
            && CPH.TryGetArg("success", out success) && success;
        if (!CPH.TryGetArg("duration", out duration)) duration = 0;
        CPH.SetArgument("voiceRelayPreparedMessage", "");
        var result = new JObject {
            ["type"] = "thsv.voice-result", ["executionId"] = executionId,
            ["relayToken"] = token, ["success"] = completed,
            ["durationMs"] = Math.Max(0, Math.Min(30000, duration))
        };
        CPH.WebsocketBroadcastJson(result.ToString(Newtonsoft.Json.Formatting.None));
        return completed;
    }
}
