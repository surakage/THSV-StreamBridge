// Purpose: Performs one validated moderation operation requested by Chat Guard and reports its result.
// Keep this action triggerless. StreamBridge supplies a one-use relay token and bounded arguments.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string requestId = Read("chatGuardRequestId", 32);
        string incidentId = Read("chatGuardIncidentId", 64);
        string platform = Read("chatGuardPlatform", 20).ToLowerInvariant();
        string mode = Read("chatGuardMode", 20).ToLowerInvariant();
        string userId = Read("chatGuardUserId", 256);
        string userName = Read("chatGuardUserName", 256);
        string messageId = Read("chatGuardMessageId", 256);
        string broadcastId = Read("chatGuardBroadcastId", 256);
        string reason = Read("chatGuardReason", 200);
        string relayToken = Read("thsvAddonRelayToken", 100);
        int duration = ReadInteger("chatGuardTimeoutSeconds", 60, 10, 86400);
        if (requestId.Length == 0 || incidentId.Length != 64 || relayToken.Length < 20) return Fail(requestId, incidentId, platform, mode, relayToken, "The request correlation or one-use relay token was invalid.");

        bool success = false; string error = "";
        try
        {
            if (platform == "twitch")
            {
                if (mode == "delete" && messageId.Length > 0) success = CPH.TwitchDeleteChatMessage(messageId, true);
                else if (mode == "timeout" && userName.Length > 0) success = CPH.TwitchTimeoutUser(userName, duration, reason, true);
                else if (mode == "ban" && userName.Length > 0) success = CPH.TwitchBanUser(userName, reason, true);
                else error = "The Twitch operation was missing its required stable identifier.";
            }
            else if (platform == "youtube")
            {
                if (mode == "timeout" && userId.Length > 0) success = CPH.YouTubeTimeoutUserById(userId, duration, broadcastId);
                else if (mode == "ban" && userId.Length > 0) success = CPH.YouTubeBanUserById(userId, broadcastId);
                else error = "The YouTube operation is unsupported or missing a stable user ID.";
            }
            else if (platform == "kick")
            {
                if (mode == "delete" && messageId.Length > 0) success = CPH.KickDeleteChatMessage(messageId);
                else if (mode == "timeout" && userName.Length > 0) success = CPH.KickTimeoutUser(userName, duration, reason, false);
                else if (mode == "ban" && userName.Length > 0) success = CPH.KickBanUser(userName, reason, false);
                else error = "The Kick operation was missing its required stable identifier.";
            }
            else error = "This platform does not support the requested moderation mode.";
            if (!success && error.Length == 0) error = "The provider did not confirm the moderation operation.";
        }
        catch (Exception exception) { error = "Moderation failed (" + exception.GetType().Name + ")."; }
        Relay(requestId, incidentId, platform, mode, relayToken, success, error);
        CPH.SetArgument("chatGuardModerationSuccess", success);
        CPH.SetArgument("chatGuardModerationError", error);
        return success;
    }

    private bool Fail(string requestId, string incidentId, string platform, string mode, string token, string error) { if (token.Length >= 20 && incidentId.Length == 64) Relay(requestId, incidentId, platform, mode, token, false, error); CPH.SetArgument("chatGuardModerationSuccess", false); CPH.SetArgument("chatGuardModerationError", error); CPH.LogWarn("THSV Chat Guard: " + error); return false; }
    private void Relay(string requestId, string incidentId, string platform, string mode, string token, bool success, string error)
    {
        var payload = new JObject { ["requestId"] = requestId, ["incidentId"] = incidentId, ["platform"] = platform, ["mode"] = mode, ["success"] = success, ["error"] = error };
        var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.chat-guard", ["eventType"] = "addon.thsv.chat-guard.moderation-result", ["sourceEventType"] = "THSV Addon - Chat Guard - Moderate", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token, ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = payload };
        CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
    }
    private string Read(string key, int maximum) { object value; string text = CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : ""; return text.Length <= maximum ? text : text.Substring(0, maximum); }
    private int ReadInteger(string key, int fallback, int minimum, int maximum) { int value; return Int32.TryParse(Read(key, 20), out value) ? Math.Min(maximum, Math.Max(minimum, value)) : fallback; }
}
