using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string actionName = Read("actionName");
        string kind = KindForAction(actionName);
        if (kind == null)
        {
            CPH.SetArgument("tikfinityRelayValid", false);
            CPH.SetArgument("tikfinityRelayError", "Unsupported TikFinity intake action.");
            return false;
        }

        var argumentKeys = new JArray();
        foreach (string key in args.Keys) argumentKeys.Add(key);
        bool simulated = ReadBooleanOrDefault("isSimulated", ReadBooleanOrDefault("simulated", ReadBooleanOrDefault("isTest", true)));
        var message = new JObject
        {
            ["type"] = "thsv.tikfinity",
            ["version"] = "1.0.0",
            ["kind"] = kind,
            ["relayId"] = Guid.NewGuid().ToString("N"),
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
            ["argumentKeys"] = argumentKeys
        };
        CPH.WebsocketBroadcastJson(message.ToString(Formatting.None));
        CPH.SetArgument("tikfinityRelayValid", true);
        CPH.SetArgument("tikfinityRelayError", "");
        CPH.SetArgument("tikfinityRelayKind", kind);
        CPH.SetArgument("tikfinityRelaySimulated", simulated);
        return true;
    }

    private string Read(string name)
    {
        object value;
        return args.TryGetValue(name, out value) && value != null ? Convert.ToString(value) ?? "" : "";
    }

    private bool ReadBooleanOrDefault(string name, bool fallback)
    {
        object value;
        if (!args.TryGetValue(name, out value) || value == null) return fallback;
        bool parsed;
        return Boolean.TryParse(Convert.ToString(value), out parsed) ? parsed : fallback;
    }

    private string First(string first, string second) { return String.IsNullOrWhiteSpace(first) ? second : first; }

    private string KindForAction(string actionName)
    {
        if (actionName == "TikTok Chat Message") return "chat";
        if (actionName == "TikTok Follow") return "follow";
        if (actionName == "TikTok Gift") return "gift";
        if (actionName == "THSV TikTok Like") return "like";
        return null;
    }
}
