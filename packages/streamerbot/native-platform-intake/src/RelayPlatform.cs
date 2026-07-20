// Purpose: Relays bounded Twitch, YouTube, or Kick trigger arguments to the local bridge WebSocket.
// Trust boundary: limits key count and value size; the Core Receiver still validates the normalized event.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const int MaximumArgumentKeys = 100;
    private const int MaximumTextLength = 2000;
    private static readonly string[] KnownArguments = {
        "actionName", "userName", "userLogin", "fromUserName", "messageId", "msgId", "eventId", "isTest", "isSimulated",
        "userId", "fromUserId", "user", "displayName", "fromUser", "userProfileUrl", "userProfilePicture", "profilePicture",
        "profileImageUrl", "targetUserProfileImageUrl", "color", "badges", "badge", "role", "isModerator", "isBroadcaster",
        "isSubscribed", "subscribed", "isVip", "message", "messageStripped", "rawInput", "amount", "donationAmount", "currency",
        "currencyCode", "count", "bits", "viewers", "monthsSubscribed", "months", "cumulative", "gifts", "giftCount", "monthStreak",
        "streakMonths", "tier", "subTier", "subscriptionTier", "giftName", "itemName", "rewardName", "rewardId", "reward.id",
        "reward.title", "rewardCost", "reward.cost", "requiresUserInput", "reward.requiresUserInput", "redemptionId", "broadcastId",
        "broadcasterUserId", "broadcasterId", "broadcastUserName", "broadcasterUserName", "broadcaster",
        "recipientId", "cumulativeMonths", "totalGifts", "totalSubsGifted", "id",
        "recipient.userId", "subscribedAt", "expiresAt", "kicks.amount", "kicks.name", "microAmount"
    };
    private sealed class AvatarCacheEntry
    {
        public string Url;
        public DateTimeOffset ExpiresAt;
    }

    private static readonly object AvatarCacheLock = new object();
    private static readonly Dictionary<string, AvatarCacheEntry> AvatarCache = new Dictionary<string, AvatarCacheEntry>(StringComparer.OrdinalIgnoreCase);

    public bool Execute()
    {
        // Snapshot only a bounded number of trigger arguments for the bridge adapter to normalize.
        string platform = PlatformName();
        string sourceEventType = CPH.GetEventType().ToString();
        if (String.IsNullOrWhiteSpace(platform) || !Supported(platform, sourceEventType))
        {
            CPH.SetArgument("platformRelayValid", false);
            CPH.SetArgument("platformRelayError", "Unsupported platform or trigger type: " + platform + "/" + sourceEventType);
            return false;
        }

        var argumentKeys = new JArray();
        foreach (string key in KnownArguments)
        {
            if (argumentKeys.Count >= MaximumArgumentKeys) break;
            object ignored;
            if (CPH.TryGetArg(key, out ignored)) argumentKeys.Add(key);
        }
        string relayId = Guid.NewGuid().ToString("N");
        string userName = First(Read("userName"), Read("userLogin"), Read("fromUserName"));
        var message = new JObject
        {
            ["type"] = "thsv.platform",
            ["version"] = "1.0.0",
            ["platform"] = platform,
            ["sourceEventType"] = sourceEventType,
            ["relayId"] = relayId,
            ["sourceEventId"] = SourceEventId(sourceEventType, First(Read("messageId"), Read("msgId"), Read("eventId"), Read("redemptionId"), Read("id"))),
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = ReadBoolean("isTest") || ReadBoolean("isSimulated"),
            ["userId"] = First(Read("userId"), Read("fromUserId")),
            ["userName"] = userName,
            ["displayName"] = First(Read("user"), Read("displayName"), Read("fromUser"), Read("userName")),
            ["profilePictureUrl"] = ProfilePictureUrl(platform, userName),
            ["nameColor"] = Read("color"),
            ["badges"] = ReadBadges(platform),
            ["role"] = Read("role"),
            ["isModerator"] = ReadBoolean("isModerator"),
            ["isBroadcaster"] = ReadBoolean("isBroadcaster"),
            ["isSubscribed"] = ReadBoolean("isSubscribed") || ReadBoolean("subscribed"),
            ["isVip"] = ReadBoolean("isVip"),
            ["message"] = Bounded(First(Read("message"), Read("messageStripped"), Read("rawInput")), MaximumTextLength),
            ["amount"] = First(MicroAmountToDecimal(ReadInvariant("microAmount")), StripCurrencySymbol(First(ReadInvariant("amount"), ReadInvariant("donationAmount")))),
            ["currency"] = First(Read("currency"), Read("currencyCode")),
            ["quantity"] = First(ReadInvariant("count"), ReadInvariant("bits"), ReadInvariant("viewers"), ReadInvariant("monthsSubscribed"), ReadInvariant("months"), ReadInvariant("cumulative"), ReadInvariant("gifts"), ReadInvariant("giftCount"), ReadInvariant("kicks.amount")),
            ["streakMonths"] = First(ReadInvariant("monthStreak"), ReadInvariant("streakMonths")),
            ["tier"] = First(Read("tier"), Read("subTier"), Read("subscriptionTier")),
            ["itemName"] = First(Read("giftName"), Read("itemName"), Read("rewardName"), Read("kicks.name")),
            ["rewardId"] = First(Read("rewardId"), Read("reward.id")),
            ["rewardTitle"] = First(Read("rewardName"), Read("reward.title")),
            ["rewardCost"] = First(ReadInvariant("rewardCost"), ReadInvariant("reward.cost")),
            ["rewardRequiresInput"] = ReadBoolean("requiresUserInput") || ReadBoolean("reward.requiresUserInput"),
            ["redemptionId"] = Read("redemptionId"),
            ["channelId"] = First(Read("broadcastId"), Read("broadcasterUserId"), Read("broadcasterId")),
            ["channelName"] = First(Read("broadcastUserName"), Read("broadcasterUserName"), Read("broadcaster")),
            ["argumentKeys"] = argumentKeys
        };
        try { CPH.WebsocketBroadcastJson(message.ToString(Formatting.None)); }
        catch (Exception error)
        {
            CPH.SetArgument("platformRelayValid", false);
            CPH.SetArgument("platformRelayError", "The validated platform event could not be relayed.");
            CPH.LogError("THSV native intake relay failed (" + error.GetType().Name + ").");
            return false;
        }
        CPH.SetArgument("platformRelayValid", true);
        CPH.SetArgument("platformRelayError", "");
        CPH.SetArgument("platformRelayPlatform", platform);
        CPH.SetArgument("platformRelayEventType", sourceEventType);
        CPH.SetArgument("platformRelayId", relayId);
        return true;
    }

    private string PlatformName()
    {
        string actionName = Read("actionName");
        if (actionName == "THSV Twitch - Intake") return "twitch";
        if (actionName == "THSV YouTube - Intake") return "youtube";
        if (actionName == "THSV Kick - Intake") return "kick";
        return "";
    }

    private bool Supported(string platform, string eventType)
    {
        if (platform == "twitch") return eventType == "TwitchChatMessage" || eventType == "TwitchFollow" || eventType == "TwitchCheer" || eventType == "TwitchSub" || eventType == "TwitchReSub" || eventType == "TwitchGiftSub" || eventType == "TwitchGiftBomb" || eventType == "TwitchRaid" || eventType == "TwitchRewardRedemption" || eventType == "TwitchStreamOnline" || eventType == "TwitchStreamOffline";
        if (platform == "youtube") return eventType == "YouTubeMessage" || eventType == "YouTubeSuperChat" || eventType == "YouTubeSuperSticker" || eventType == "YouTubeNewSubscriber" || eventType == "YouTubeNewSponsor" || eventType == "YouTubeMemberMileStone" || eventType == "YouTubeMembershipGift" || eventType == "YouTubeBroadcastStarted" || eventType == "YouTubeBroadcastEnded";
        if (platform == "kick") return eventType == "KickChatMessage" || eventType == "KickFollow" || eventType == "KickSubscription" || eventType == "KickResubscription" || eventType == "KickGiftSubscription" || eventType == "KickMassGiftSubscription" || eventType == "KickKicksGifted" || eventType == "KickRewardRedemption" || eventType == "KickStreamOnline" || eventType == "KickStreamOffline";
        return false;
    }

    // Neither Twitch nor Kick exposes any message/event ID for their Subscription, Resubscription,
    // Gift Subscription, Mass Gift Subscription, or (Twitch only) Gift Bomb triggers -- confirmed
    // against live Action History argument dumps and Streamer.bot's own published variable
    // reference, not guessed. Rather than blocking these alerts outright, build a deterministic ID
    // from fields that cannot repeat for a genuinely new event (a monotonically increasing or
    // per-event-unique value), so a real redelivery of the same event reproduces the same ID while
    // two independent events cannot. Every synthetic ID is prefixed so the bridge can still mark it
    // unverified rather than treating it as a platform-native identity.
    // Kick Mass Gift Subscription's recipients are indexed arrays (recipient.0.userId,
    // recipient.1.userId, ...), unlike single Gift Subscription's unindexed recipient.userId -- the
    // fallback here deliberately uses only the gifter's own userId plus the shared subscribedAt
    // timestamp, never a recipient field, since the recipient count varies per event.
    private string SourceEventId(string sourceEventType, string realId)
    {
        if (realId.Length > 0) return realId;
        string userId = Read("userId");
        if (userId.Length == 0) return "";
        if (sourceEventType == "TwitchSub" || sourceEventType == "KickSubscription") return "synthetic:" + sourceEventType + ":" + userId;
        if (sourceEventType == "TwitchReSub")
        {
            string cumulative = First(ReadInvariant("cumulative"), ReadInvariant("monthStreak"));
            return cumulative.Length == 0 ? "" : "synthetic:" + sourceEventType + ":" + userId + ":" + cumulative;
        }
        if (sourceEventType == "KickResubscription")
        {
            string expiresAt = Read("expiresAt");
            return expiresAt.Length == 0 ? "" : "synthetic:" + sourceEventType + ":" + userId + ":" + expiresAt;
        }
        if (sourceEventType == "TwitchGiftSub")
        {
            string recipientId = Read("recipientId");
            string cumulativeMonths = ReadInvariant("cumulativeMonths");
            return recipientId.Length == 0 || cumulativeMonths.Length == 0 ? "" : "synthetic:" + sourceEventType + ":" + recipientId + ":" + cumulativeMonths;
        }
        if (sourceEventType == "TwitchGiftBomb")
        {
            string totalGifts = First(ReadInvariant("totalGifts"), ReadInvariant("totalSubsGifted"));
            return totalGifts.Length == 0 ? "" : "synthetic:" + sourceEventType + ":" + userId + ":" + totalGifts;
        }
        if (sourceEventType == "KickGiftSubscription")
        {
            string recipientId = Read("recipient.userId");
            string subscribedAt = Read("subscribedAt");
            return recipientId.Length == 0 || subscribedAt.Length == 0 ? "" : "synthetic:" + sourceEventType + ":" + recipientId + ":" + subscribedAt;
        }
        if (sourceEventType == "KickMassGiftSubscription")
        {
            string subscribedAt = Read("subscribedAt");
            return subscribedAt.Length == 0 ? "" : "synthetic:" + sourceEventType + ":" + userId + ":" + subscribedAt;
        }
        return "";
    }

    private string Read(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? Bounded(Convert.ToString(value) ?? "", MaximumTextLength) : "";
    }

    private object ReadObject(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) ? value : null;
    }

    private string ProfilePictureUrl(string platform, string userName)
    {
        string direct = First(Read("userProfileUrl"), Read("userProfilePicture"), Read("profilePicture"), Read("profileImageUrl"), Read("targetUserProfileImageUrl"));
        if (!String.IsNullOrWhiteSpace(direct) || platform != "twitch" || String.IsNullOrWhiteSpace(userName)) return direct;

        DateTimeOffset now = DateTimeOffset.UtcNow;
        lock (AvatarCacheLock)
        {
            AvatarCacheEntry cached;
            if (AvatarCache.TryGetValue(userName, out cached) && cached.ExpiresAt > now) return cached.Url;
        }

        string resolved = "";
        try
        {
            var userInfo = CPH.TwitchGetExtendedUserInfoByLogin(userName);
            if (userInfo != null) resolved = userInfo.ProfileImageUrl ?? "";
        }
        catch (Exception error)
        {
            CPH.LogWarn("THSV StreamBridge could not resolve a Twitch avatar (" + error.GetType().Name + ").");
        }

        lock (AvatarCacheLock)
        {
            if (AvatarCache.Count >= 2000) AvatarCache.Clear();
            AvatarCache[userName] = new AvatarCacheEntry { Url = resolved, ExpiresAt = now.AddHours(String.IsNullOrWhiteSpace(resolved) ? 1 : 6) };
        }
        return resolved;
    }

    private JArray ReadBadges(string platform)
    {
        var badges = new JArray();
        object raw = platform == "kick" ? ReadObject("badge") : ReadObject("badges");
        IEnumerable entries = raw as IEnumerable;
        if (entries == null || raw is string) return badges;

        foreach (object entry in entries)
        {
            if (entry == null || badges.Count >= 16) break;
            try
            {
                JObject source = JObject.FromObject(entry);
                string id = platform == "kick"
                    ? First(ReadToken(source, "id"), ReadToken(source, "name"))
                    : First(ReadToken(source, "Name"), ReadToken(source, "id"));
                string label = platform == "kick"
                    ? First(ReadToken(source, "name"), ReadToken(source, "id"))
                    : First(ReadToken(source, "Name"), ReadToken(source, "id"));
                string iconUrl = platform == "kick"
                    ? First(ReadToken(source, "info"), ReadToken(source, "ImageUrl"))
                    : First(ReadToken(source, "ImageUrl"), ReadToken(source, "imageUrl"));
                if (String.IsNullOrWhiteSpace(label)) continue;
                badges.Add(new JObject { ["id"] = id, ["label"] = label, ["iconUrl"] = iconUrl });
            }
            catch (Exception error)
            {
                CPH.LogWarn("THSV StreamBridge skipped an unreadable " + platform + " badge (" + error.GetType().Name + ").");
            }
        }
        return badges;
    }

    private string ReadToken(JObject source, string name)
    {
        foreach (JProperty property in source.Properties())
        {
            if (String.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase)) return Bounded(Convert.ToString(property.Value, CultureInfo.InvariantCulture) ?? "", 2048);
        }
        return "";
    }

    private string ReadInvariant(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? Bounded(Convert.ToString(value, CultureInfo.InvariantCulture) ?? "", 64) : "";
    }

    private bool ReadBoolean(string name)
    {
        object value;
        if (!CPH.TryGetArg(name, out value) || value == null) return false;
        bool parsed;
        return Boolean.TryParse(Convert.ToString(value), out parsed) && parsed;
    }

    private string First(params string[] values)
    {
        foreach (string value in values) if (!String.IsNullOrWhiteSpace(value)) return value;
        return "";
    }

    private static string Bounded(string value, int maximum)
    {
        if (String.IsNullOrEmpty(value)) return "";
        return value.Length <= maximum ? value : value.Substring(0, maximum);
    }

    // Some platform triggers (e.g. YouTube Super Chat/Super Sticker) hand over a pre-formatted
    // currency string like "$42.00" rather than a bare number. The bridge's wire contract requires
    // a plain decimal string, so strip any leading currency symbol before it leaves this relay.
    private static string StripCurrencySymbol(string value)
    {
        int start = 0;
        while (start < value.Length && !Char.IsDigit(value[start])) start++;
        return start < value.Length ? value.Substring(start) : "";
    }

    // YouTube also exposes the same monetary value as a whole-number micro-units integer (one
    // millionth of the currency unit), which is preferred over the pre-formatted string when present:
    // it cannot carry a thousands-separator comma or currency symbol that would fail the bridge's
    // decimal-string validation, and converting it uses only integer arithmetic, never floating point.
    private static string MicroAmountToDecimal(string microAmount)
    {
        long micros;
        if (microAmount.Length == 0 || !Int64.TryParse(microAmount, NumberStyles.Integer, CultureInfo.InvariantCulture, out micros) || micros < 0) return "";
        long whole = micros / 1_000_000L;
        long fraction = micros % 1_000_000L;
        string fractionText = fraction.ToString("D6", CultureInfo.InvariantCulture).TrimEnd('0');
        return fractionText.Length == 0 ? whole.ToString(CultureInfo.InvariantCulture) : whole.ToString(CultureInfo.InvariantCulture) + "." + fractionText;
    }
}
