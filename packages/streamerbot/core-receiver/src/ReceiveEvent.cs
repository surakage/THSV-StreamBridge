using System;
using System.Globalization;
using System.IO;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ContractVersion = "1.1.0";
    private const string PackageVersion = "1.0.3";
    private const string SupportedSchemaVersion = "1.0.0";

    public bool Execute()
    {
        InitializeOutputs();

        if (!CPH.TryGetArg("streamBridgeEvent", out string eventJson) || string.IsNullOrWhiteSpace(eventJson))
            return Fail("Missing required streamBridgeEvent JSON argument.");

        JObject envelope;
        try
        {
            using (StringReader stringReader = new StringReader(eventJson))
            using (JsonTextReader jsonReader = new JsonTextReader(stringReader))
            {
                jsonReader.DateParseHandling = DateParseHandling.None;
                envelope = JObject.Load(jsonReader);
            }
        }
        catch (JsonException)
        {
            return Fail("streamBridgeEvent is not valid JSON.");
        }

        string schemaVersion = ReadRequiredString(envelope, "schemaVersion", 16);
        string eventId = ReadRequiredString(envelope, "eventId", 256);
        string eventType = ReadRequiredString(envelope, "eventType", 128);
        string platform = ReadRequiredString(envelope, "platform", 64);
        string receivedAt = ReadRequiredString(envelope, "receivedAt", 64);
        JObject source = envelope["source"] as JObject;
        JObject channel = envelope["channel"] as JObject;
        JObject payload = envelope["payload"] as JObject;
        JObject metadata = envelope["metadata"] as JObject;

        if (schemaVersion != SupportedSchemaVersion)
            return Fail("Unsupported normalized event schemaVersion: " + (schemaVersion ?? "<missing>"));
        if (eventId == null) return Fail("Missing or invalid eventId.");
        if (!IsEventType(eventType)) return Fail("Missing or invalid eventType.");
        if (!IsPlatform(platform)) return Fail("Missing or invalid platform.");
        if (!IsTimestamp(receivedAt))
            return Fail("Missing or invalid receivedAt timestamp.");
        if (source == null || ReadRequiredString(source, "adapter", 100) == null || ReadRequiredString(source, "eventName", 100) == null)
            return Fail("Missing or invalid source.adapter/source.eventName.");
        if (channel == null || ReadRequiredString(channel, "name", 256) == null || !IsOptionalString(channel, "id", 256))
            return Fail("Missing or invalid channel data.");
        if (payload == null) return Fail("Missing required payload object.");
        if (metadata == null || metadata["simulated"] == null || metadata["simulated"].Type != JTokenType.Boolean)
            return Fail("Missing or invalid metadata.simulated boolean.");
        if (!IsOptionalString(metadata, "correlationId", 256))
            return Fail("Invalid metadata.correlationId.");
        if (!IsOptionalPositiveInteger(metadata, "bridgeSequence"))
            return Fail("Invalid metadata.bridgeSequence.");

        JObject user = envelope["user"] as JObject;
        string userName = user == null ? string.Empty : ReadRequiredString(user, "name", 256);
        string userActorType = user == null ? string.Empty : ReadActorType(user);
        if (user != null && (userName == null || userActorType == null || !IsOptionalString(user, "id", 256) || !IsOptionalString(user, "displayName", 256) || !IsRoles(user["roles"])))
            return Fail("Invalid user data.");

        CPH.SetArgument("streamBridgeSchemaVersion", schemaVersion);
        CPH.SetArgument("streamBridgeEventId", eventId);
        CPH.SetArgument("streamBridgeEventType", eventType);
        CPH.SetArgument("streamBridgeReceivedAt", receivedAt);
        CPH.SetArgument("streamBridgeSequence", ReadOptionalPositiveInteger(metadata, "bridgeSequence"));
        CPH.SetArgument("streamBridgePlatform", platform);
        CPH.SetArgument("streamBridgeSourceAdapter", ReadRequiredString(source, "adapter", 100));
        CPH.SetArgument("streamBridgeChannelId", ReadOptionalString(channel, "id"));
        CPH.SetArgument("streamBridgeChannelName", ReadRequiredString(channel, "name", 256));
        CPH.SetArgument("streamBridgeUserId", user == null ? string.Empty : ReadOptionalString(user, "id"));
        CPH.SetArgument("streamBridgeUserName", userName ?? string.Empty);
        CPH.SetArgument("streamBridgeUserDisplayName", user == null ? string.Empty : ReadOptionalString(user, "displayName", userName));
        CPH.SetArgument("streamBridgeUserActorType", userActorType ?? string.Empty);
        CPH.SetArgument("streamBridgeUserRoles", user?["roles"]?.ToString(Formatting.None) ?? "[]");
        CPH.SetArgument("streamBridgePayload", payload.ToString(Formatting.None));
        CPH.SetArgument("streamBridgeMetadata", metadata.ToString(Formatting.None));
        CPH.SetArgument("streamBridgeCorrelationId", ReadOptionalString(metadata, "correlationId"));
        CPH.SetArgument("streamBridgeSimulated", metadata.Value<bool>("simulated"));
        CPH.SetArgument("streamBridgeValid", true);
        CPH.LogDebug("THSV StreamBridge accepted " + eventType + " event " + eventId + " from " + platform + ".");
        return true;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("streamBridgeValid", false);
        CPH.SetArgument("streamBridgeValidationError", string.Empty);
        CPH.SetArgument("streamBridgeContractVersion", ContractVersion);
        CPH.SetArgument("streamBridgePackageVersion", PackageVersion);
        CPH.SetArgument("streamBridgeSchemaVersion", string.Empty);
        CPH.SetArgument("streamBridgeEventId", string.Empty);
        CPH.SetArgument("streamBridgeEventType", string.Empty);
        CPH.SetArgument("streamBridgeReceivedAt", string.Empty);
        CPH.SetArgument("streamBridgeSequence", 0L);
        CPH.SetArgument("streamBridgePlatform", string.Empty);
        CPH.SetArgument("streamBridgeSourceAdapter", string.Empty);
        CPH.SetArgument("streamBridgeChannelId", string.Empty);
        CPH.SetArgument("streamBridgeChannelName", string.Empty);
        CPH.SetArgument("streamBridgeUserId", string.Empty);
        CPH.SetArgument("streamBridgeUserName", string.Empty);
        CPH.SetArgument("streamBridgeUserDisplayName", string.Empty);
        CPH.SetArgument("streamBridgeUserActorType", string.Empty);
        CPH.SetArgument("streamBridgeUserRoles", "[]");
        CPH.SetArgument("streamBridgePayload", "{}");
        CPH.SetArgument("streamBridgeMetadata", "{}");
        CPH.SetArgument("streamBridgeCorrelationId", string.Empty);
        CPH.SetArgument("streamBridgeSimulated", false);
    }

    private bool Fail(string message)
    {
        CPH.SetArgument("streamBridgeValidationError", message);
        CPH.LogError("THSV StreamBridge receiver rejected an event: " + message);
        return false;
    }

    private static bool IsEventType(string value)
    {
        if (value == null || value.Length < 3 || value.Length > 128) return false;
        bool segmentStart = true;
        bool sawNamespace = false;
        foreach (char character in value)
        {
            if (character == '.')
            {
                if (segmentStart) return false;
                segmentStart = true;
                sawNamespace = true;
                continue;
            }
            if (segmentStart)
            {
                if (character < 'a' || character > 'z') return false;
                segmentStart = false;
            }
            else if (!IsIdentifierCharacter(character)) return false;
        }
        return sawNamespace && !segmentStart;
    }

    private static bool IsPlatform(string value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > 64 || value[0] < 'a' || value[0] > 'z') return false;
        for (int index = 1; index < value.Length; index++)
        {
            if (!IsIdentifierCharacter(value[index])) return false;
        }
        return true;
    }

    private static bool IsIdentifierCharacter(char character)
    {
        return (character >= 'a' && character <= 'z') ||
            (character >= '0' && character <= '9') || character == '-';
    }

    private static bool IsTimestamp(string value)
    {
        if (value == null) return false;
        DateTimeOffset parsed;
        return DateTimeOffset.TryParse(
            value,
            CultureInfo.InvariantCulture,
            DateTimeStyles.RoundtripKind,
            out parsed);
    }

    private static bool IsOptionalString(JObject value, string property, int maxLength)
    {
        JToken token = value[property];
        return token == null || (token.Type == JTokenType.String && token.ToString().Length <= maxLength);
    }

    private static bool IsRoles(JToken token)
    {
        JArray roles = token as JArray;
        if (roles == null || roles.Count > 32) return false;
        foreach (JToken role in roles)
        {
            if (role.Type != JTokenType.String || role.ToString().Length > 64) return false;
        }
        return true;
    }

    private static bool IsOptionalPositiveInteger(JObject value, string property)
    {
        JToken token = value[property];
        if (token == null) return true;
        return token.Type == JTokenType.Integer && ReadOptionalPositiveInteger(value, property) > 0;
    }

    private static long ReadOptionalPositiveInteger(JObject value, string property)
    {
        JToken token = value[property];
        if (token == null || token.Type != JTokenType.Integer) return 0L;
        long parsed;
        return long.TryParse(token.ToString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed) && parsed > 0 ? parsed : 0L;
    }

    private static string ReadActorType(JObject user)
    {
        JToken token = user["actorType"];
        if (token == null) return "human";
        if (token.Type != JTokenType.String) return null;
        string value = token.ToString();
        return value == "human" || value == "bot" || value == "system" ? value : null;
    }

    private static string ReadRequiredString(JObject value, string property, int maxLength)
    {
        JToken token = value[property];
        if (token == null || token.Type != JTokenType.String) return null;
        string result = token.ToString();
        return string.IsNullOrWhiteSpace(result) || result.Length > maxLength ? null : result;
    }

    private static string ReadOptionalString(JObject value, string property, string fallback = "")
    {
        string result = value.Value<string>(property);
        return string.IsNullOrWhiteSpace(result) ? fallback ?? string.Empty : result;
    }
}
