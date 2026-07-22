// Purpose: Enables or disables Random Clip Player through the bridge. Attach the Enable action
// to the scene's activation trigger and the Disable action to its deactivation trigger. The Set
// Argument sub-action included with each imported action supplies the intended state.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.random-clip-player";

    public bool Execute()
    {
        object rawEnabled;
        bool enabled;
        if (!CPH.TryGetArg("randomClipPlayerEnabled", out rawEnabled) || rawEnabled == null || !Boolean.TryParse(rawEnabled.ToString(), out enabled))
            return Fail("the randomClipPlayerEnabled argument was missing or invalid.");

        string relayId = Guid.NewGuid().ToString("N");
        var message = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.random-clip-player.control",
            ["sourceEventType"] = enabled
                ? "THSV Addon - Random Clip Player - Enable"
                : "THSV Addon - Random Clip Player - Disable",
            ["relayId"] = relayId,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = new JObject { ["enabled"] = enabled },
        };

        try { CPH.WebsocketBroadcastJson(message.ToString(Newtonsoft.Json.Formatting.None)); }
        catch (Exception exception) { return Fail("relaying the playback state failed (" + exception.GetType().Name + ")."); }

        CPH.SetArgument("randomClipPlayerControlValid", true);
        CPH.SetArgument("randomClipPlayerControlError", "");
        CPH.SetArgument("randomClipPlayerEnabledState", enabled);
        CPH.SetArgument("randomClipPlayerRelayId", relayId);
        CPH.LogInfo("THSV Random Clip Player " + (enabled ? "enabled." : "disabled."));
        return true;
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("randomClipPlayerControlValid", false);
        CPH.SetArgument("randomClipPlayerControlError", reason);
        CPH.LogError("THSV Random Clip Player control failed: " + reason);
        return false;
    }
}
