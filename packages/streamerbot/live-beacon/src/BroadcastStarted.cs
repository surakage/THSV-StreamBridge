// Purpose: Converts an OBS, Meld, or Streamlabs Desktop Streaming Started trigger into one
// creator-controlled Live Beacon fallback signal for platforms such as TikTok.
// Safety: Carries no webhook, message, or viewer data. Test triggers remain marked simulated.
// References: mscorlib.dll, System.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        bool simulated = ReadBoolean("isTest") || ReadBoolean("isSimulated");
        var envelope = new JObject {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = "thsv.live-beacon",
            ["eventType"] = "addon.thsv.live-beacon.broadcast-control",
            ["sourceEventType"] = "THSV Addon - Live Beacon - Broadcast Started",
            ["relayId"] = Guid.NewGuid().ToString("N"),
            ["relayToken"] = "",
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = simulated,
            ["payload"] = new JObject {
                ["action"] = "online",
                ["startedAt"] = DateTimeOffset.UtcNow.ToString("O")
            }
        };
        try {
            CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
            CPH.SetArgument("liveBeaconFallbackAccepted", true);
            return true;
        }
        catch (Exception error) {
            CPH.SetArgument("liveBeaconFallbackAccepted", false);
            CPH.SetArgument("liveBeaconFallbackError", "StreamBridge did not accept the broadcast-start signal.");
            CPH.LogWarn("THSV Live Beacon fallback relay failed (" + error.GetType().Name + ").");
            return false;
        }
    }

    private bool ReadBoolean(string name)
    {
        object value;
        if (!CPH.TryGetArg(name, out value) || value == null) return false;
        bool parsed;
        return Boolean.TryParse(Convert.ToString(value), out parsed) && parsed;
    }
}
