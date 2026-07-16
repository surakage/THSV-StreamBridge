using System;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ContractVersion = "1.1.0";
    private const string PackageVersion = "1.1.1";
    private const int MaximumMessageLength = 2000;

    public bool Execute()
    {
        InitializeOutputs();

        if (!CPH.TryGetArg("streamBridgeValid", out bool receiverValid) || !receiverValid)
            return Fail("The StreamBridge receiver did not validate this event.");

        if (!CPH.TryGetArg("streamBridgeEventType", out string eventType) || eventType != "chat.message")
            return true;

        CPH.SetArgument("multiChatHandled", true);

        if (!CPH.TryGetArg("streamBridgeEventId", out string eventId) || string.IsNullOrWhiteSpace(eventId))
            return Fail("Missing validated streamBridgeEventId.");
        if (!CPH.TryGetArg("streamBridgeReceivedAt", out string receivedAt) || string.IsNullOrWhiteSpace(receivedAt))
            return Fail("Missing validated streamBridgeReceivedAt.");
        if (!CPH.TryGetArg("streamBridgeSequence", out long sequence) || sequence <= 0)
            return Fail("Missing validated positive streamBridgeSequence.");
        if (!CPH.TryGetArg("streamBridgePlatform", out string platform) || string.IsNullOrWhiteSpace(platform))
            return Fail("Missing validated streamBridgePlatform.");
        if (!CPH.TryGetArg("streamBridgeChannelName", out string channelName) || string.IsNullOrWhiteSpace(channelName))
            return Fail("Missing validated streamBridgeChannelName.");
        if (!CPH.TryGetArg("streamBridgeUserName", out string userName) || string.IsNullOrWhiteSpace(userName))
            return Fail("A chat.message event requires a validated streamBridgeUserName.");
        if (!CPH.TryGetArg("streamBridgeUserActorType", out string actorType) || !IsActorType(actorType))
            return Fail("Missing or invalid validated streamBridgeUserActorType.");
        if (actorType == "system")
            return Fail("System messages must use chat.system-message, not public chat.message.");
        if (!CPH.TryGetArg("streamBridgePayload", out string payloadJson) || string.IsNullOrWhiteSpace(payloadJson))
            return Fail("Missing validated streamBridgePayload.");

        JObject payload;
        try
        {
            payload = JObject.Parse(payloadJson);
        }
        catch (JsonException)
        {
            return Fail("streamBridgePayload is not valid JSON.");
        }

        JToken messageToken = payload["message"];
        if (messageToken == null || messageToken.Type != JTokenType.String)
            return Fail("chat.message payload.message must be a string.");

        string message = NormalizePlainText(messageToken.ToString());
        if (message.Length == 0)
            return Fail("chat.message payload.message is empty after normalization.");
        if (message.Length > MaximumMessageLength)
            return Fail("chat.message payload.message exceeds 2000 characters.");

        string displayName = ReadOptionalArgument("streamBridgeUserDisplayName", userName);
        string channelId = ReadOptionalArgument("streamBridgeChannelId");
        string userId = ReadOptionalArgument("streamBridgeUserId");
        string rolesJson = ReadOptionalArgument("streamBridgeUserRoles", "[]");
        JArray roles;
        try
        {
            roles = JArray.Parse(rolesJson);
        }
        catch (JsonException)
        {
            return Fail("streamBridgeUserRoles is not a valid JSON array.");
        }

        CPH.SetArgument("multiChatEventId", eventId);
        CPH.SetArgument("multiChatReceivedAt", receivedAt);
        CPH.SetArgument("multiChatSequence", sequence);
        CPH.SetArgument("multiChatVisibility", "public");
        CPH.SetArgument("multiChatPlatform", platform);
        CPH.SetArgument("multiChatChannelId", channelId);
        CPH.SetArgument("multiChatChannelName", channelName);
        CPH.SetArgument("multiChatUserId", userId);
        CPH.SetArgument("multiChatUserName", userName);
        CPH.SetArgument("multiChatUserDisplayName", displayName);
        CPH.SetArgument("multiChatActorType", actorType);
        CPH.SetArgument("multiChatUserRoles", roles.ToString(Formatting.None));
        CPH.SetArgument("multiChatMessage", message);
        CPH.SetArgument("multiChatMessageLength", message.Length);
        CPH.SetArgument("multiChatIsBroadcaster", HasRole(roles, "broadcaster"));
        CPH.SetArgument("multiChatIsModerator", HasRole(roles, "moderator") || HasRole(roles, "mod"));
        CPH.SetArgument("multiChatIsSubscriber", HasRole(roles, "subscriber") || HasRole(roles, "member"));
        CPH.SetArgument("multiChatIsBot", actorType == "bot");
        CPH.SetArgument("multiChatSimulated", ReadBooleanArgument("streamBridgeSimulated"));
        CPH.SetArgument("multiChatValid", true);
        return true;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("multiChatHandled", false);
        CPH.SetArgument("multiChatValid", false);
        CPH.SetArgument("multiChatValidationError", string.Empty);
        CPH.SetArgument("multiChatContractVersion", ContractVersion);
        CPH.SetArgument("multiChatPackageVersion", PackageVersion);
        CPH.SetArgument("multiChatEventId", string.Empty);
        CPH.SetArgument("multiChatReceivedAt", string.Empty);
        CPH.SetArgument("multiChatSequence", 0L);
        CPH.SetArgument("multiChatVisibility", string.Empty);
        CPH.SetArgument("multiChatPlatform", string.Empty);
        CPH.SetArgument("multiChatChannelId", string.Empty);
        CPH.SetArgument("multiChatChannelName", string.Empty);
        CPH.SetArgument("multiChatUserId", string.Empty);
        CPH.SetArgument("multiChatUserName", string.Empty);
        CPH.SetArgument("multiChatUserDisplayName", string.Empty);
        CPH.SetArgument("multiChatActorType", string.Empty);
        CPH.SetArgument("multiChatUserRoles", "[]");
        CPH.SetArgument("multiChatMessage", string.Empty);
        CPH.SetArgument("multiChatMessageLength", 0);
        CPH.SetArgument("multiChatIsBroadcaster", false);
        CPH.SetArgument("multiChatIsModerator", false);
        CPH.SetArgument("multiChatIsSubscriber", false);
        CPH.SetArgument("multiChatIsBot", false);
        CPH.SetArgument("multiChatSimulated", false);
    }

    private bool Fail(string message)
    {
        CPH.SetArgument("multiChatValidationError", message);
        CPH.LogError("THSV Multi-Chat rejected an event: " + message);
        return false;
    }

    private string ReadOptionalArgument(string name, string fallback = "")
    {
        string value;
        return CPH.TryGetArg(name, out value) && !string.IsNullOrWhiteSpace(value) ? value : fallback;
    }

    private bool ReadBooleanArgument(string name)
    {
        bool value;
        return CPH.TryGetArg(name, out value) && value;
    }

    private static bool HasRole(JArray roles, string expected)
    {
        foreach (JToken role in roles)
        {
            if (role.Type == JTokenType.String && string.Equals(role.ToString(), expected, StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    private static bool IsActorType(string value)
    {
        return value == "human" || value == "bot" || value == "system";
    }

    private static string NormalizePlainText(string input)
    {
        StringBuilder result = new StringBuilder(input.Length);
        bool pendingSpace = false;
        foreach (char character in input)
        {
            if (char.IsControl(character) || char.IsWhiteSpace(character))
            {
                pendingSpace = result.Length > 0;
                continue;
            }
            if (pendingSpace)
            {
                result.Append(' ');
                pendingSpace = false;
            }
            result.Append(character);
        }
        return result.ToString();
    }
}
