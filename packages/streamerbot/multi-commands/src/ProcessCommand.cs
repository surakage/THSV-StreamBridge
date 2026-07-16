using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ContractVersion = "1.0.0";
    private const string PackageVersion = "1.0.1";
    private const int MaximumInputLength = 500;
    private const int MaximumArguments = 32;
    private const int MaximumArgumentLength = 256;

    public bool Execute()
    {
        InitializeOutputs();
        if (!CPH.TryGetArg("streamBridgeValid", out bool receiverValid) || !receiverValid)
            return Fail("The StreamBridge receiver did not validate this event.");
        if (!CPH.TryGetArg("streamBridgeEventType", out string eventType) || eventType != "command.received")
            return true;

        CPH.SetArgument("multiCommandHandled", true);
        if (!CPH.TryGetArg("streamBridgeEventId", out string eventId) || string.IsNullOrWhiteSpace(eventId)) return Fail("Missing validated streamBridgeEventId.");
        if (!CPH.TryGetArg("streamBridgeReceivedAt", out string receivedAt) || string.IsNullOrWhiteSpace(receivedAt)) return Fail("Missing validated streamBridgeReceivedAt.");
        if (!CPH.TryGetArg("streamBridgeSequence", out long sequence) || sequence <= 0) return Fail("Missing validated positive streamBridgeSequence.");
        if (!CPH.TryGetArg("streamBridgePlatform", out string platform) || string.IsNullOrWhiteSpace(platform)) return Fail("Missing validated streamBridgePlatform.");
        if (!CPH.TryGetArg("streamBridgeChannelName", out string channelName) || string.IsNullOrWhiteSpace(channelName)) return Fail("Missing validated streamBridgeChannelName.");
        if (!CPH.TryGetArg("streamBridgeUserName", out string userName) || string.IsNullOrWhiteSpace(userName)) return Fail("A command.received event requires a validated streamBridgeUserName.");
        if (!CPH.TryGetArg("streamBridgeUserActorType", out string actorType) || (actorType != "human" && actorType != "bot")) return Fail("Public commands require a human or bot actor.");
        if (!CPH.TryGetArg("streamBridgePayload", out string payloadJson) || string.IsNullOrWhiteSpace(payloadJson)) return Fail("Missing validated streamBridgePayload.");

        JObject payload;
        try { payload = JObject.Parse(payloadJson); }
        catch (JsonException) { return Fail("streamBridgePayload is not valid JSON."); }

        string command;
        if (!ReadCommandName(payload, "command", out command)) return Fail("command.received payload.command must be a valid command name.");
        string invokedAs;
        if (!ReadOptionalCommandName(payload, "invokedAs", command, out invokedAs)) return Fail("command.received payload.invokedAs must be a valid command name.");
        JArray arguments = payload["arguments"] as JArray;
        if (arguments == null) return Fail("command.received payload.arguments must be an array of strings.");
        if (arguments.Count > MaximumArguments) return Fail("Command has more than 32 arguments.");
        foreach (JToken argument in arguments)
        {
            if (argument.Type != JTokenType.String) return Fail("command.received payload.arguments must be an array of strings.");
            if (argument.ToString().Length > MaximumArgumentLength) return Fail("A command argument exceeds 256 characters.");
        }

        string rawInput = ReadOptionalString(payload, "rawInput", "!" + invokedAs);
        if (rawInput == null) return Fail("command.received payload.rawInput must be a string.");
        if (rawInput.Length > MaximumInputLength) return Fail("command.received payload.rawInput exceeds 500 characters.");
        string prefix = ReadOptionalString(payload, "prefix", "!");
        if (prefix == null || prefix.Length != 1 || char.IsWhiteSpace(prefix[0])) return Fail("command.received payload.prefix must be one non-whitespace character.");
        string minimumRole = ReadOptionalString(payload, "minimumRole", "viewer");
        if (!IsRole(minimumRole)) return Fail("command.received payload.minimumRole is invalid.");
        bool allowBots;
        if (!ReadOptionalBoolean(payload, "allowBots", false, out allowBots)) return Fail("command.received payload.allowBots must be a boolean.");

        string rolesJson = ReadOptionalArgument("streamBridgeUserRoles", "[]");
        JArray roles;
        try { roles = JArray.Parse(rolesJson); }
        catch (JsonException) { return Fail("streamBridgeUserRoles is not a valid JSON array."); }
        string authorizationReason;
        bool authorized = IsAuthorized(roles, actorType, minimumRole, allowBots, out authorizationReason);

        CPH.SetArgument("multiCommandEventId", eventId);
        CPH.SetArgument("multiCommandReceivedAt", receivedAt);
        CPH.SetArgument("multiCommandSequence", sequence);
        CPH.SetArgument("multiCommandVisibility", "public");
        CPH.SetArgument("multiCommandPlatform", platform);
        CPH.SetArgument("multiCommandChannelId", ReadOptionalArgument("streamBridgeChannelId"));
        CPH.SetArgument("multiCommandChannelName", channelName);
        CPH.SetArgument("multiCommandUserId", ReadOptionalArgument("streamBridgeUserId"));
        CPH.SetArgument("multiCommandUserName", userName);
        CPH.SetArgument("multiCommandUserDisplayName", ReadOptionalArgument("streamBridgeUserDisplayName", userName));
        CPH.SetArgument("multiCommandActorType", actorType);
        CPH.SetArgument("multiCommandUserRoles", roles.ToString(Formatting.None));
        CPH.SetArgument("multiCommandName", command);
        CPH.SetArgument("multiCommandInvokedAs", invokedAs);
        CPH.SetArgument("multiCommandIsAlias", command != invokedAs);
        CPH.SetArgument("multiCommandArguments", arguments.ToString(Formatting.None));
        CPH.SetArgument("multiCommandArgumentCount", arguments.Count);
        CPH.SetArgument("multiCommandRawInput", rawInput);
        CPH.SetArgument("multiCommandPrefix", prefix);
        CPH.SetArgument("multiCommandMinimumRole", minimumRole);
        CPH.SetArgument("multiCommandAllowBots", allowBots);
        CPH.SetArgument("multiCommandAuthorized", authorized);
        CPH.SetArgument("multiCommandAuthorizationReason", authorizationReason);
        CPH.SetArgument("multiCommandSimulated", ReadBooleanArgument("streamBridgeSimulated"));
        CPH.SetArgument("multiCommandValid", true);
        return true;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("multiCommandHandled", false);
        CPH.SetArgument("multiCommandValid", false);
        CPH.SetArgument("multiCommandValidationError", string.Empty);
        CPH.SetArgument("multiCommandContractVersion", ContractVersion);
        CPH.SetArgument("multiCommandPackageVersion", PackageVersion);
        CPH.SetArgument("multiCommandEventId", string.Empty);
        CPH.SetArgument("multiCommandReceivedAt", string.Empty);
        CPH.SetArgument("multiCommandSequence", 0L);
        CPH.SetArgument("multiCommandVisibility", string.Empty);
        CPH.SetArgument("multiCommandPlatform", string.Empty);
        CPH.SetArgument("multiCommandChannelId", string.Empty);
        CPH.SetArgument("multiCommandChannelName", string.Empty);
        CPH.SetArgument("multiCommandUserId", string.Empty);
        CPH.SetArgument("multiCommandUserName", string.Empty);
        CPH.SetArgument("multiCommandUserDisplayName", string.Empty);
        CPH.SetArgument("multiCommandActorType", string.Empty);
        CPH.SetArgument("multiCommandUserRoles", "[]");
        CPH.SetArgument("multiCommandName", string.Empty);
        CPH.SetArgument("multiCommandInvokedAs", string.Empty);
        CPH.SetArgument("multiCommandIsAlias", false);
        CPH.SetArgument("multiCommandArguments", "[]");
        CPH.SetArgument("multiCommandArgumentCount", 0);
        CPH.SetArgument("multiCommandRawInput", string.Empty);
        CPH.SetArgument("multiCommandPrefix", string.Empty);
        CPH.SetArgument("multiCommandMinimumRole", string.Empty);
        CPH.SetArgument("multiCommandAllowBots", false);
        CPH.SetArgument("multiCommandAuthorized", false);
        CPH.SetArgument("multiCommandAuthorizationReason", string.Empty);
        CPH.SetArgument("multiCommandSimulated", false);
    }

    private bool Fail(string message)
    {
        CPH.SetArgument("multiCommandValidationError", message);
        CPH.LogError("THSV Multi-Commands rejected an event: " + message);
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

    private static bool ReadCommandName(JObject payload, string key, out string value)
    {
        JToken token = payload[key];
        value = token != null && token.Type == JTokenType.String ? token.ToString().ToLowerInvariant() : string.Empty;
        return IsCommandName(value);
    }

    private static bool ReadOptionalCommandName(JObject payload, string key, string fallback, out string value)
    {
        if (payload[key] == null) { value = fallback; return true; }
        return ReadCommandName(payload, key, out value);
    }

    private static string ReadOptionalString(JObject payload, string key, string fallback)
    {
        JToken token = payload[key];
        if (token == null) return fallback;
        return token.Type == JTokenType.String ? token.ToString() : null;
    }

    private static bool ReadOptionalBoolean(JObject payload, string key, bool fallback, out bool value)
    {
        JToken token = payload[key];
        if (token == null) { value = fallback; return true; }
        if (token.Type != JTokenType.Boolean) { value = false; return false; }
        return bool.TryParse(token.ToString(), out value);
    }

    private static bool IsCommandName(string value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > 64 || value[0] < 'a' || value[0] > 'z') return false;
        for (int index = 1; index < value.Length; index++)
        {
            char character = value[index];
            if (!((character >= 'a' && character <= 'z') || (character >= '0' && character <= '9') || character == '-')) return false;
        }
        return true;
    }

    private static bool IsRole(string value)
    {
        return value == "viewer" || value == "subscriber" || value == "moderator" || value == "broadcaster";
    }

    private static bool IsAuthorized(JArray roles, string actorType, string minimumRole, bool allowBots, out string reason)
    {
        if (actorType == "bot" && !allowBots) { reason = "bot commands are disabled"; return false; }
        int actual = HasRole(roles, "broadcaster") ? 3 : HasRole(roles, "moderator") || HasRole(roles, "mod") ? 2 : HasRole(roles, "subscriber") || HasRole(roles, "member") ? 1 : 0;
        int required = minimumRole == "broadcaster" ? 3 : minimumRole == "moderator" ? 2 : minimumRole == "subscriber" ? 1 : 0;
        if (actual < required) { reason = "requires " + minimumRole + " role"; return false; }
        reason = "authorized";
        return true;
    }

    private static bool HasRole(JArray roles, string expected)
    {
        foreach (JToken role in roles)
            if (role.Type == JTokenType.String && string.Equals(role.ToString(), expected, StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }
}
