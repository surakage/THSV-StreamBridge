// Purpose: Adds the command user, or the viewer whose message was replied to, to Chat Guard's trusted-viewer list.
// The imported !guardtrust command is disabled by default. Only the broadcaster or a moderator may use it.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        bool authorized = ReadBoolean("isBroadcaster") || ReadBoolean("isModerator");
        if (!authorized) return Fail("Only the broadcaster or a moderator can trust a viewer.");

        string platform = NormalizePlatform(Read("commandSource", 20));
        if (platform.Length == 0) platform = NormalizePlatform(Read("eventSource", 20));
        if (platform.Length == 0) return Fail("The command source was not Twitch, YouTube, or Kick.");

        // A reply is the safest cross-platform way to select another viewer because the trigger
        // supplies their stable provider ID. Without a reply, the command issuer is selected.
        string userId = First("reply.userId", "replyUserId", "targetUserId", "userId", 256);
        string label = First("reply.userName", "reply.displayName", "replyUserName", "targetUserName", "userName", "user", 80);
        if (userId.Length == 0 || label.Length == 0) return Fail("Reply to the viewer's message, or run the command as the viewer being trusted, so Streamer.bot can supply a stable user ID.");

        var payload = new JObject { ["platform"] = platform, ["userId"] = userId, ["label"] = label, ["authorized"] = true };
        var envelope = new JObject {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.chat-guard",
            ["eventType"] = "addon.thsv.chat-guard.trusted-account-request",
            ["sourceEventType"] = "THSV Addon - Chat Guard - Trust Viewer",
            ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = "",
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = payload
        };
        try
        {
            CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
            CPH.SetArgument("chatGuardTrustValid", true);
            CPH.SetArgument("chatGuardTrustPlatform", platform);
            CPH.SetArgument("chatGuardTrustLabel", label);
            CPH.SetArgument("chatGuardTrustError", "");
            CPH.LogInfo("THSV Chat Guard: trusted-viewer request sent for " + label + " on " + platform + ".");
            return true;
        }
        catch (Exception error) { return Fail("The trusted-viewer request could not be sent (" + error.GetType().Name + ")."); }
    }

    private bool Fail(string error) { CPH.SetArgument("chatGuardTrustValid", false); CPH.SetArgument("chatGuardTrustError", error); CPH.LogWarn("THSV Chat Guard: " + error); return false; }
    private string First(string a, string b, string c, string d, int maximum) { string value = Read(a, maximum); if (value.Length == 0) value = Read(b, maximum); if (value.Length == 0) value = Read(c, maximum); if (value.Length == 0) value = Read(d, maximum); return value; }
    private string First(string a, string b, string c, string d, string e, string f, int maximum) { string value = First(a, b, c, d, maximum); if (value.Length == 0) value = Read(e, maximum); if (value.Length == 0) value = Read(f, maximum); return value; }
    private string NormalizePlatform(string value) { value = value.ToLowerInvariant(); if (value.Contains("twitch")) return "twitch"; if (value.Contains("youtube")) return "youtube"; if (value.Contains("kick")) return "kick"; return ""; }
    private string Read(string key, int maximum) { object value; string text = CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : ""; return text.Length <= maximum ? text : text.Substring(0, maximum); }
    private bool ReadBoolean(string key) { object value; bool parsed; return CPH.TryGetArg(key, out value) && value != null && Boolean.TryParse(Convert.ToString(value), out parsed) && parsed; }
}
