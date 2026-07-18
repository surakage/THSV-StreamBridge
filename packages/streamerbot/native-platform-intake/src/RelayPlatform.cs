using System;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string platform = PlatformName();
        string sourceEventType = First(Read("sourceEventType"), CPH.GetEventType().ToString());
        if (String.IsNullOrWhiteSpace(platform) || !Supported(platform, sourceEventType))
        {
            CPH.SetArgument("platformRelayValid", false);
            CPH.SetArgument("platformRelayError", "Unsupported platform or trigger type: " + platform + "/" + sourceEventType);
            return false;
        }

        var argumentKeys = new JArray();
        foreach (string key in args.Keys) argumentKeys.Add(key);
        string relayId = Guid.NewGuid().ToString("N");
        var message = new JObject
        {
            ["type"] = "thsv.platform",
            ["version"] = "1.0.0",
            ["platform"] = platform,
            ["sourceEventType"] = sourceEventType,
            ["relayId"] = relayId,
            ["sourceEventId"] = First(Read("messageId"), Read("msgId"), Read("eventId")),
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = ReadBoolean("isTest") || ReadBoolean("isSimulated"),
            ["userId"] = First(Read("userId"), Read("fromUserId")),
            ["userName"] = First(Read("userName"), Read("userLogin"), Read("fromUserName")),
            ["displayName"] = First(Read("user"), Read("displayName"), Read("fromUser"), Read("userName")),
            ["profilePictureUrl"] = First(Read("userProfilePicture"), Read("profilePicture"), Read("profileImageUrl")),
            ["role"] = Read("role"),
            ["isModerator"] = ReadBoolean("isModerator"),
            ["isBroadcaster"] = ReadBoolean("isBroadcaster"),
            ["isSubscribed"] = ReadBoolean("isSubscribed") || ReadBoolean("subscribed"),
            ["message"] = First(Read("message"), Read("messageStripped"), Read("rawInput")),
            ["amount"] = First(ReadInvariant("amount"), ReadInvariant("donationAmount")),
            ["currency"] = First(Read("currency"), Read("currencyCode")),
            ["quantity"] = First(ReadInvariant("count"), ReadInvariant("bits"), ReadInvariant("viewers"), ReadInvariant("monthsSubscribed"), ReadInvariant("giftCount")),
            ["tier"] = First(Read("tier"), Read("subTier"), Read("subscriptionTier")),
            ["itemName"] = First(Read("giftName"), Read("itemName"), Read("rewardName"), "Kick Gift"),
            ["rewardId"] = First(Read("rewardId"), Read("reward.id")),
            ["rewardTitle"] = First(Read("rewardName"), Read("reward.title")),
            ["rewardCost"] = First(ReadInvariant("rewardCost"), ReadInvariant("reward.cost")),
            ["rewardRequiresInput"] = ReadBoolean("requiresUserInput") || ReadBoolean("reward.requiresUserInput"),
            ["redemptionId"] = Read("redemptionId"),
            ["channelId"] = First(Read("broadcastId"), Read("broadcasterUserId"), Read("broadcasterId")),
            ["channelName"] = First(Read("broadcastUserName"), Read("broadcasterUserName"), Read("broadcaster")),
            ["argumentKeys"] = argumentKeys
        };
        CPH.WebsocketBroadcastJson(message.ToString(Formatting.None));
        CPH.SetArgument("platformRelayValid", true);
        CPH.SetArgument("platformRelayError", "");
        CPH.SetArgument("platformRelayPlatform", platform);
        CPH.SetArgument("platformRelayEventType", sourceEventType);
        CPH.SetArgument("platformRelayId", relayId);
        return true;
    }

    private string PlatformName()
    {
        string requested = Read("relayPlatform").ToLowerInvariant();
        if (requested == "twitch" || requested == "youtube" || requested == "kick") return requested;
        string actionName = Read("actionName");
        if (actionName == "THSV Twitch - Intake") return "twitch";
        if (actionName == "THSV YouTube - Intake") return "youtube";
        if (actionName == "THSV Kick - Intake") return "kick";
        return "";
    }

    private bool Supported(string platform, string eventType)
    {
        if (platform == "twitch") return eventType == "TwitchChatMessage" || eventType == "TwitchFollow" || eventType == "TwitchCheer" || eventType == "TwitchSub" || eventType == "TwitchReSub" || eventType == "TwitchGiftSub" || eventType == "TwitchGiftBomb" || eventType == "TwitchRaid" || eventType == "TwitchRewardRedemption";
        if (platform == "youtube") return eventType == "YouTubeMessage" || eventType == "YouTubeSuperChat" || eventType == "YouTubeSuperSticker" || eventType == "YouTubeNewSubscriber" || eventType == "YouTubeNewSponsor" || eventType == "YouTubeMemberMileStone" || eventType == "YouTubeMembershipGift";
        if (platform == "kick") return eventType == "KickChatMessage" || eventType == "KickFollow" || eventType == "KickSubscription" || eventType == "KickResubscription" || eventType == "KickGiftSubscription" || eventType == "KickMassGiftSubscription" || eventType == "KickGifted" || eventType == "KickRewardRedemption";
        return false;
    }

    private string Read(string name)
    {
        object value;
        return args.TryGetValue(name, out value) && value != null ? Convert.ToString(value) ?? "" : "";
    }

    private string ReadInvariant(string name)
    {
        object value;
        return args.TryGetValue(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture) ?? "" : "";
    }

    private bool ReadBoolean(string name)
    {
        object value;
        if (!args.TryGetValue(name, out value) || value == null) return false;
        bool parsed;
        return Boolean.TryParse(Convert.ToString(value), out parsed) && parsed;
    }

    private string First(params string[] values)
    {
        foreach (string value in values) if (!String.IsNullOrWhiteSpace(value)) return value;
        return "";
    }
}
