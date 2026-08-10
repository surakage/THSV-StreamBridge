// Purpose: Relays bounded TikFinity chat, follow, gift, like, and subscription fields to the bridge.
// Trust boundary: accepts only the five installed THSV TikTok actions and caps relayed keys and values.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const int MaximumArgumentKeys = 100;
    private const int MaximumTextLength = 2000;
    private static readonly string[] KnownArguments = {
        "actionName", "isSimulated", "simulated", "isTest", "userId", "username", "nickname", "profilePictureUrl",
        "profilePicturUrl", "commandParams", "eventId", "messageId", "msgId", "giftId", "giftName", "coins", "repeatCount", "likeCount", "totalLikeCount", "subMonth",
        "isMe", "isOwner", "isBroadcaster", "isBot", "streamerUsername", "hostUsername", "roomUsername", "botUserName", "botUsername"
    };

    public bool Execute()
    {
        // The action name is the allowlist: unknown TikFinity actions are rejected before broadcast.
        string actionName = Read("actionName");
        string kind = KindForAction(actionName);
        if (kind == null)
        {
            CPH.SetArgument("tikfinityRelayValid", false);
            CPH.SetArgument("tikfinityRelayError", "Unsupported TikFinity intake action.");
            return false;
        }

        if (kind == "chat") AutoUnlurk(Read("userId"), First(Read("username"), Read("nickname")));

        var argumentKeys = new JArray();
        foreach (string key in KnownArguments)
        {
            if (argumentKeys.Count >= MaximumArgumentKeys) break;
            object ignored;
            if (CPH.TryGetArg(key, out ignored)) argumentKeys.Add(key);
        }
        bool simulated = ReadBooleanOrDefault("isSimulated", ReadBooleanOrDefault("simulated", ReadBooleanOrDefault("isTest", false)));
        var message = new JObject
        {
            ["type"] = "thsv.tikfinity",
            ["version"] = "1.0.0",
            ["kind"] = kind,
            ["relayId"] = Guid.NewGuid().ToString("N"),
            ["providerEventId"] = First(Read("eventId"), First(Read("messageId"), Read("msgId"))),
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = simulated,
            ["userId"] = Read("userId"),
            ["username"] = Read("username"),
            ["nickname"] = Read("nickname"),
            ["fromConnectedAccount"] = ReadBooleanOrDefault("isMe", false) || ReadBooleanOrDefault("isOwner", false) || ReadBooleanOrDefault("isBroadcaster", false) || ReadBooleanOrDefault("isBot", false),
            ["hostUsername"] = First(Read("streamerUsername"), First(Read("hostUsername"), Read("roomUsername"))),
            ["botUserName"] = First(Read("botUserName"), Read("botUsername")),
            ["profilePictureUrl"] = First(Read("profilePictureUrl"), Read("profilePicturUrl")),
            ["commandParams"] = Read("commandParams"),
            ["giftId"] = Read("giftId"),
            ["giftName"] = Read("giftName"),
            ["coins"] = Read("coins"),
            ["repeatCount"] = Read("repeatCount"),
            ["likeCount"] = Read("likeCount"),
            ["totalLikeCount"] = Read("totalLikeCount"),
            ["subMonth"] = Read("subMonth"),
            ["argumentKeys"] = argumentKeys
        };
        try { CPH.WebsocketBroadcastJson(message.ToString(Formatting.None)); }
        catch (Exception error)
        {
            CPH.SetArgument("tikfinityRelayValid", false);
            CPH.SetArgument("tikfinityRelayError", "The validated TikFinity event could not be relayed.");
            CPH.LogError("THSV TikFinity intake relay failed (" + error.GetType().Name + ").");
            return false;
        }
        CPH.SetArgument("tikfinityRelayValid", true);
        CPH.SetArgument("tikfinityRelayError", "");
        CPH.SetArgument("tikfinityRelayKind", kind);
        CPH.SetArgument("tikfinityRelaySimulated", simulated);
        return true;
    }

    // Mirrors the native intake behavior so TikFinity viewers are automatically marked back on
    // their first later chat message without creating another WebSocket connection.
    private void AutoUnlurk(string userId, string userName)
    {
        string identity = String.IsNullOrWhiteSpace(userId) ? (userName ?? "").Trim().ToLowerInvariant() : userId.Trim();
        if (identity.Length == 0) return;
        string encoded = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(identity)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        string key = "thsv.command.lurk.v1.tiktok." + encoded;
        long startedAt = CPH.GetGlobalVar<long?>(key, true) ?? 0L;
        if (startedAt <= 0L || DateTime.UtcNow.Ticks - startedAt <= TimeSpan.FromSeconds(3).Ticks) return;
        CPH.UnsetGlobalVar(key, true);
        CPH.SetArgument("thsvAutoUnlurked", true);
    }

    private string Read(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? Bounded(Convert.ToString(value) ?? "", MaximumTextLength) : "";
    }

    private bool ReadBooleanOrDefault(string name, bool fallback)
    {
        object value;
        if (!CPH.TryGetArg(name, out value) || value == null) return fallback;
        bool parsed;
        return Boolean.TryParse(Convert.ToString(value), out parsed) ? parsed : fallback;
    }

    private string First(string first, string second) { return String.IsNullOrWhiteSpace(first) ? second : first; }

    private string KindForAction(string actionName)
    {
        if (actionName == "THSV TikTok - Chat") return "chat";
        if (actionName == "THSV TikTok - Follow") return "follow";
        if (actionName == "THSV TikTok - Gift") return "gift";
        if (actionName == "THSV TikTok - Like") return "like";
        if (actionName == "THSV TikTok - Subscription") return "subscription";
        return null;
    }

    private static string Bounded(string value, int maximum)
    {
        if (String.IsNullOrEmpty(value)) return "";
        return value.Length <= maximum ? value : value.Substring(0, maximum);
    }
}
