// Purpose: Resolves a direct, playable MP4 URL for one Twitch clip and relays it to the Random
// Clip Player add-on. Twitch's own clip embed URL requires an iframe "parent" domain handshake
// that a locally-hosted overlay browser source cannot satisfy; TwitchGetClipDownloadUrls
// returns a direct source URL instead, which drops straight into a <video src> with no embed step.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.random-clip-player";

    public bool Execute()
    {
        object rawRelayToken;
        string relayToken = CPH.TryGetArg("thsvAddonRelayToken", out rawRelayToken) && rawRelayToken != null ? rawRelayToken.ToString().Trim() : "";
        if (String.IsNullOrWhiteSpace(relayToken)) return Fail("the bridge did not supply an add-on relay token.");
        object rawClipId;
        string clipId = CPH.TryGetArg("clipId", out rawClipId) && rawClipId != null ? rawClipId.ToString().Trim() : "";
        if (String.IsNullOrEmpty(clipId)) return Fail("no clipId argument was supplied.");

        // TwitchGetClipDownloadUrls is newer than stable Streamer.bot 1.0.7. Calling it by name keeps this action
        // compiling on 1.0.7, where it reports that clip playback needs a newer Streamer.bot.
        var method = CPH.GetType().GetMethod("TwitchGetClipDownloadUrls", new[] { typeof(string) });
        if (method == null) return Fail("clip playback needs a newer Streamer.bot than this one (1.1 or later).");
        object download;
        try { download = method.Invoke(CPH, new object[] { clipId }); }
        catch (Exception exception) { return Fail("Twitch clip download resolution failed (" + (exception.InnerException ?? exception).GetType().Name + ")."); }
        string landscapeUrl = DownloadProperty(download, "LandscapeDownloadUrl");
        if (landscapeUrl.Length == 0) return Fail("Twitch returned no downloadable URL for this clip.");

        string relayId = Guid.NewGuid().ToString("N");
        var message = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.random-clip-player.clip-download-received",
            ["sourceEventType"] = "THSV Addon - Random Clip Player - Get Clip Download",
            ["relayId"] = relayId,
            ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = new JObject
            {
                ["clipId"] = clipId,
                ["landscapeUrl"] = landscapeUrl,
                ["portraitUrl"] = DownloadProperty(download, "PortraitDownloadUrl"),
            },
        };
        try { CPH.WebsocketBroadcastJson(message.ToString(Newtonsoft.Json.Formatting.None)); }
        catch (Exception exception) { return Fail("relaying the clip download URL failed (" + exception.GetType().Name + ")."); }

        CPH.SetArgument("randomClipPlayerRelayValid", true);
        CPH.SetArgument("randomClipPlayerRelayError", "");
        CPH.SetArgument("randomClipPlayerRelayId", relayId);
        return true;
    }

    private static string DownloadProperty(object download, string name)
    {
        var property = download == null ? null : download.GetType().GetProperty(name);
        object value = property == null ? null : property.GetValue(download, null);
        return value == null ? "" : value.ToString().Trim();
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("randomClipPlayerRelayValid", false);
        CPH.SetArgument("randomClipPlayerRelayError", reason);
        CPH.LogError("THSV Random Clip Player - Get Clip Download failed: " + reason);
        return false;
    }
}
