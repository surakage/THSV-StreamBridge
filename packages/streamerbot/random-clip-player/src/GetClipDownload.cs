// Purpose: Resolves a direct, playable MP4 URL for one Twitch clip and relays it to the Random
// Clip Player add-on. Twitch's own clip embed URL requires an iframe "parent" domain handshake
// that a locally-hosted overlay browser source cannot satisfy; CPH.TwitchGetClipDownloadUrls
// returns a direct source URL instead, which drops straight into a <video src> with no embed step.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json.Linq;
using Twitch.Common.Models.Api;

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

        ClipDownloadData download;
        try { download = CPH.TwitchGetClipDownloadUrls(clipId); }
        catch (Exception exception) { return Fail("Twitch clip download resolution failed (" + exception.GetType().Name + ")."); }
        if (download == null || String.IsNullOrWhiteSpace(download.LandscapeDownloadUrl)) return Fail("Twitch returned no downloadable URL for this clip.");

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
                ["landscapeUrl"] = download.LandscapeDownloadUrl,
                ["portraitUrl"] = download.PortraitDownloadUrl ?? "",
            },
        };
        try { CPH.WebsocketBroadcastJson(message.ToString(Newtonsoft.Json.Formatting.None)); }
        catch (Exception exception) { return Fail("relaying the clip download URL failed (" + exception.GetType().Name + ")."); }

        CPH.SetArgument("randomClipPlayerRelayValid", true);
        CPH.SetArgument("randomClipPlayerRelayError", "");
        CPH.SetArgument("randomClipPlayerRelayId", relayId);
        return true;
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("randomClipPlayerRelayValid", false);
        CPH.SetArgument("randomClipPlayerRelayError", reason);
        CPH.LogError("THSV Random Clip Player - Get Clip Download failed: " + reason);
        return false;
    }
}
