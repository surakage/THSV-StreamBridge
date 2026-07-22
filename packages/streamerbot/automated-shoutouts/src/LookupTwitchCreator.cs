// Purpose: Resolves a Twitch target's documented extended profile and relays only the bounded
// category/profile fields needed by Automated Shoutouts. An empty category means the add-on must
// not automatically promote that target.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.automated-shoutouts";

    public bool Execute()
    {
        string relayToken = ReadArgument("thsvAddonRelayToken");
        if (String.IsNullOrWhiteSpace(relayToken)) return Fail("StreamBridge did not dispatch this lookup action.");
        string lookupId = Bounded(ReadArgument("lookupId"), 100);
        string userId = Bounded(ReadArgument("targetUserId"), 256);
        string userName = Bounded(ReadArgument("targetUserName").TrimStart('@'), 256);
        if (String.IsNullOrWhiteSpace(lookupId) || (String.IsNullOrWhiteSpace(userId) && String.IsNullOrWhiteSpace(userName))) return Fail("A lookup ID and Twitch target are required.");

        string category = "";
        string profileImageUrl = "";
        try
        {
            // Prefer a stable user ID so a renamed Twitch channel still resolves correctly.
            var information = !String.IsNullOrWhiteSpace(userId)
                ? CPH.TwitchGetExtendedUserInfoById(userId)
                : CPH.TwitchGetExtendedUserInfoByLogin(userName);
            if (information != null)
            {
                category = Bounded(information.Game, 140);
                profileImageUrl = Bounded(information.ProfileImageUrl, 2048);
            }
        }
        catch (Exception exception) { return Fail("Twitch creator lookup failed (" + exception.GetType().Name + ")."); }

        string relayId = Guid.NewGuid().ToString("N");
        var envelope = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.automated-shoutouts.twitch-profile-received",
            ["sourceEventType"] = "THSV Addon - Automated Shoutouts - Lookup Twitch Creator",
            ["relayId"] = relayId,
            ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = new JObject
            {
                ["lookupId"] = lookupId,
                ["category"] = category,
                ["profileImageUrl"] = profileImageUrl,
            },
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Newtonsoft.Json.Formatting.None)); }
        catch (Exception exception) { return Fail("Relaying the Twitch creator lookup failed (" + exception.GetType().Name + ")."); }

        CPH.SetArgument("automatedShoutoutLookupValid", true);
        CPH.SetArgument("automatedShoutoutLookupCategory", category);
        CPH.SetArgument("automatedShoutoutLookupHasCategory", !String.IsNullOrWhiteSpace(category));
        return true;
    }

    private string ReadArgument(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? value.ToString().Trim() : "";
    }

    private string Bounded(string value, int maximumLength)
    {
        if (String.IsNullOrEmpty(value)) return "";
        return value.Length > maximumLength ? value.Substring(0, maximumLength) : value;
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("automatedShoutoutLookupValid", false);
        CPH.SetArgument("automatedShoutoutLookupCategory", "");
        CPH.SetArgument("automatedShoutoutLookupHasCategory", false);
        CPH.LogWarn("THSV Automated Shoutouts lookup: " + reason);
        return false;
    }
}
