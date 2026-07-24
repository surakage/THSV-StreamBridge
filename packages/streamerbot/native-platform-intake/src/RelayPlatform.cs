using System;
using System.Globalization;
using System.Text.RegularExpressions;
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
            ["sourceEventId"] = First(Read("messageId"), Read("msgId"), Read("eventId"), Read("donationId"), Read("charityDonationId")),
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = ReadBoolean("isTest") || ReadBoolean("isSimulated"),
            ["userId"] = First(Read("userId"), Read("fromUserId")),
            ["userName"] = First(Read("userName"), Read("userLogin"), Read("fromUserName"), Read("from"), Read("donationFrom"), Read("user")),
            ["displayName"] = First(Read("user"), Read("displayName"), Read("fromUser"), Read("from"), Read("userName"), Read("donationFrom")),
            ["profilePictureUrl"] = First(Read("userProfilePicture"), Read("profilePicture"), Read("profileImageUrl")),
            ["role"] = Read("role"),
            ["isModerator"] = ReadBoolean("isModerator"),
            ["isBroadcaster"] = ReadBoolean("isBroadcaster"),
            ["isSubscribed"] = ReadBoolean("isSubscribed") || ReadBoolean("subscribed"),
            ["message"] = First(Read("message"), Read("messageStripped"), Read("rawInput"), Read("type"), Read("donationMessage"), Read("charityDonationMessage")),
            ["amount"] = First(ReadInvariant("amount"), ReadInvariant("donationAmount"), ReadInvariant("charityDonationAmount"), NormalizeAmount(ReadInvariant("donationFormattedAmount")), NormalizeAmount(ReadInvariant("charityDonationFormattedAmount"))),
            ["currency"] = First(Read("currency"), Read("currencyCode"), Read("charityDonationCurrency")),
            ["quantity"] = First(ReadInvariant("count"), ReadInvariant("bits"), ReadInvariant("viewers"), ReadInvariant("monthsSubscribed"), ReadInvariant("giftCount"), ReadInvariant("jewelsAmount"), ReadInvariant("giftAmount")),
            ["tier"] = First(Read("tier"), Read("subTier"), Read("subscriptionTier")),
            ["merchandiseFrom"] = First(Read("merchandiseFrom"), Read("from"), Read("donationFrom")),
            ["merchandiseMessage"] = First(Read("merchandiseMessage"), Read("message"), Read("donationMessage"), Read("type")),
            ["merchandiseProduct"] = First(Read("merchandiseProduct"), Read("product"), Read("item"), Read("itemName")),
            ["merchandiseImageUrl"] = First(Read("merchandiseImageUrl"), Read("imageUrl"), Read("url"), Read("itemUrl")),
            ["merchandiseImageEscaped"] = First(Read("merchandiseImageEscaped"), Read("imageEscaped"), Read("escapedImage")),
            ["itemName"] = First(Read("giftName"), Read("itemName"), Read("rewardName"), "Kick Gift"),
            ["giftName"] = First(Read("gift.name"), Read("giftName"), Read("itemName"), Read("rewardName"), "Kick Gift"),
            ["giftUrl"] = First(Read("gift.url"), Read("giftUrl"), Read("url"), Read("itemUrl")),
            ["altText"] = First(Read("gift.altText"), Read("altText"), Read("message")),
            ["altTextLanguage"] = First(Read("gift.altTextLanguage"), Read("altTextLanguage")),
            ["durationInSeconds"] = First(Read("gift.durationInSeconds"), Read("durationInSeconds"), Read("duration")),
            ["hasVisualEffect"] = First(Read("gift.hasVisualEffect"), Read("hasVisualEffect")),
            ["isCombo"] = First(Read("gift.isCombo"), Read("isCombo")),
            ["comboCount"] = First(Read("gift.comboCount"), Read("comboCount")),
            ["months"] = First(Read("months")),
            ["itemCount"] = First(ReadInvariant("itemCount")),
            ["item0"] = First(Read("item0"), Read("item")),
            ["fromSharedChat"] = First(Read("fromSharedChat")),
            ["charityDonationAmount"] = ReadInvariant("charityDonationAmount"),
            ["charityDonationCurrency"] = Read("charityDonationCurrency"),
            ["charityDonationMessage"] = First(Read("charityDonationMessage"), Read("donationMessage")),
            ["charityDonationFrom"] = Read("charityDonationFrom"),
            ["watchStreak"] = First(Read("watchStreak")),
            ["hypeTrainId"] = First(Read("id")),
            ["hypeTrainLevel"] = First(Read("level")),
            ["hypeTrainPrevLevel"] = First(Read("prevLevel")),
            ["hypeTrainStartedAt"] = First(Read("startedAt")),
            ["hypeTrainExpiresAt"] = First(Read("expiresAt")),
            ["hypeTrainDuration"] = First(Read("duration")),
            ["hypeTrainContributors"] = First(Read("contributors")),
            ["hypeTrainPercent"] = First(Read("percent")),
            ["hypeTrainPercentDecimal"] = First(Read("percentDecimal")),
            ["hypeTrainTopBitsUser"] = First(Read("top.bits.user")),
            ["hypeTrainTopBitsUserName"] = First(Read("top.bits.userName")),
            ["hypeTrainTopBitsUserId"] = First(Read("top.bits.userId")),
            ["hypeTrainTopBitsTotal"] = First(Read("top.bits.total")),
            ["adLength"] = First(Read("adLength")),
            ["adLengthMs"] = First(Read("adLengthMs")),
            ["adScheduled"] = First(Read("adScheduled")),
            ["minutes"] = First(Read("minutes")),
            ["nextAdAt"] = First(Read("nextAdAt")),
            ["snoozesLeft"] = First(Read("snoozesLeft")),
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
        if (requested == "twitch" || requested == "youtube" || requested == "kick" || requested == "streamlabs" || requested == "kofi") return requested;
        string actionName = Read("actionName");
        if (actionName == "THSV Twitch - Intake") return "twitch";
        if (actionName == "THSV YouTube - Intake") return "youtube";
        if (actionName == "THSV Kick - Intake") return "kick";
        if (actionName == "THSV Streamlabs - Intake") return "streamlabs";
        if (actionName == "THSV Kofi - Intake") return "kofi";
        return "";
    }

    private bool Supported(string platform, string eventType)
    {
        if (platform == "twitch") return eventType == "TwitchChatMessage" || eventType == "TwitchFollow" || eventType == "TwitchCheer" || eventType == "TwitchSub" || eventType == "TwitchReSub" || eventType == "TwitchGiftSub" || eventType == "TwitchGiftBomb" || eventType == "TwitchRaid" || eventType == "TwitchPowerUpRedemption" || eventType == "TwitchGiftPaidUpgrade" || eventType == "TwitchPayItForward" || eventType == "TwitchPrimePaidUpgrade" || eventType == "TwitchModiversary" || eventType == "TwitchHypeTrainStart" || eventType == "TwitchHypeTrainLevelUp" || eventType == "TwitchHypeTrainUpdate" || eventType == "TwitchHypeTrainEnd" || eventType == "TwitchWatchStreak" || eventType == "TwitchAdRun" || eventType == "TwitchUpcomingAd";
        if (platform == "youtube") return eventType == "YouTubeMessage" || eventType == "YouTubeSuperChat" || eventType == "YouTubeSuperSticker" || eventType == "YouTubeNewSubscriber" || eventType == "YouTubeNewSponsor" || eventType == "YouTubeMemberMileStone" || eventType == "YouTubeMembershipGift" || eventType == "YouTubeJewelsGifted";
        if (platform == "kick") return eventType == "KickChatMessage" || eventType == "KickFollow" || eventType == "KickSubscription" || eventType == "KickResubscription" || eventType == "KickGiftSubscription" || eventType == "KickMassGiftSubscription" || eventType == "KickGifted";
        if (platform == "streamlabs") return eventType == "StreamlabsDonation" || eventType == "StreamlabsCharityDonation" || eventType == "StreamlabsMerchandise";
        if (platform == "kofi") return eventType == "KofiDonation" || eventType == "KofiCommission" || eventType == "KofiResubscription" || eventType == "KofiSubscription" || eventType == "KofiShopOrder";
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

    private string NormalizeAmount(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var compact = value.Replace(" ", "");
        var match = Regex.Match(compact, @"^-?(?:\d[\d,]*)(?:\.\d{1,6})?$");
        return match.Success ? match.Value.Replace(",", "") : "";
    }

    private string First(params string[] values)
    {
        foreach (string value in values) if (!String.IsNullOrWhiteSpace(value)) return value;
        return "";
    }
}
