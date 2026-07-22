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
        "profilePicturUrl", "commandParams", "eventId", "messageId", "msgId", "giftId", "giftName", "coins", "repeatCount", "likeCount", "totalLikeCount", "subMonth"
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

        var argumentKeys = new JArray();
        foreach (string key in KnownArguments)
        {
            if (argumentKeys.Count >= MaximumArgumentKeys) break;
            object ignored;
            if (CPH.TryGetArg(key, out ignored)) argumentKeys.Add(key);
        }
        bool simulated = ReadBooleanOrDefault("isSimulated", ReadBooleanOrDefault("simulated", ReadBooleanOrDefault("isTest", true)));
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
