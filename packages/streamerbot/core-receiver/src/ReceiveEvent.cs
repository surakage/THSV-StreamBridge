using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ContractVersion = "1.0.0";
    private const string PackageVersion = "1.0.0";
    private const string SupportedSchemaVersion = "1.0.0";

    public bool Execute()
    {
        CPH.SetArgument("streamBridgeValid", false);
        CPH.SetArgument("streamBridgeValidationError", string.Empty);
        CPH.SetArgument("streamBridgeContractVersion", ContractVersion);
        CPH.SetArgument("streamBridgePackageVersion", PackageVersion);

        if (!CPH.TryGetArg("streamBridgeEvent", out string eventJson) || string.IsNullOrWhiteSpace(eventJson))
            return Fail("Missing required streamBridgeEvent JSON argument.");

        JObject envelope;
        try
        {
            envelope = JObject.Parse(eventJson);
        }
        catch (JsonException)
        {
            return Fail("streamBridgeEvent is not valid JSON.");
        }

        string schemaVersion = ReadRequiredString(envelope, "schemaVersion");
        string eventId = ReadRequiredString(envelope, "eventId");
        string eventType = ReadRequiredString(envelope, "eventType");
        string platform = ReadRequiredString(envelope, "platform");
        string receivedAt = ReadRequiredString(envelope, "receivedAt");
        JObject source = envelope["source"] as JObject;
        JObject channel = envelope["channel"] as JObject;
        JObject payload = envelope["payload"] as JObject;
        JObject metadata = envelope["metadata"] as JObject;

        if (schemaVersion != SupportedSchemaVersion)
            return Fail("Unsupported normalized event schemaVersion: " + (schemaVersion ?? "<missing>"));
        if (eventId == null) return Fail("Missing required eventId.");
        if (eventType == null) return Fail("Missing required eventType.");
        if (platform == null) return Fail("Missing required platform.");
        if (receivedAt == null || !DateTimeOffset.TryParse(receivedAt, out _))
            return Fail("Missing or invalid receivedAt timestamp.");
        if (source == null || ReadRequiredString(source, "adapter") == null)
            return Fail("Missing required source.adapter.");
        if (channel == null || ReadRequiredString(channel, "name") == null)
            return Fail("Missing required channel.name.");
        if (payload == null) return Fail("Missing required payload object.");
        if (metadata == null) return Fail("Missing required metadata object.");

        JObject user = envelope["user"] as JObject;
        string userName = user == null ? string.Empty : ReadRequiredString(user, "name");
        if (user != null && userName == null) return Fail("user.name is required when user is present.");

        CPH.SetArgument("streamBridgeSchemaVersion", schemaVersion);
        CPH.SetArgument("streamBridgeEventId", eventId);
        CPH.SetArgument("streamBridgeEventType", eventType);
        CPH.SetArgument("streamBridgePlatform", platform);
        CPH.SetArgument("streamBridgeSourceAdapter", ReadRequiredString(source, "adapter"));
        CPH.SetArgument("streamBridgeChannelId", ReadOptionalString(channel, "id"));
        CPH.SetArgument("streamBridgeChannelName", ReadRequiredString(channel, "name"));
        CPH.SetArgument("streamBridgeUserId", user == null ? string.Empty : ReadOptionalString(user, "id"));
        CPH.SetArgument("streamBridgeUserName", userName ?? string.Empty);
        CPH.SetArgument("streamBridgeUserDisplayName", user == null ? string.Empty : ReadOptionalString(user, "displayName", userName));
        CPH.SetArgument("streamBridgeUserRoles", user?["roles"]?.ToString(Formatting.None) ?? "[]");
        CPH.SetArgument("streamBridgePayload", payload.ToString(Formatting.None));
        CPH.SetArgument("streamBridgeMetadata", metadata.ToString(Formatting.None));
        CPH.SetArgument("streamBridgeCorrelationId", ReadOptionalString(metadata, "correlationId"));
        CPH.SetArgument("streamBridgeSimulated", metadata.Value<bool?>("simulated") ?? false);
        CPH.SetArgument("streamBridgeValid", true);
        CPH.LogDebug("THSV StreamBridge accepted " + eventType + " event " + eventId + " from " + platform + ".");
        return true;
    }

    private bool Fail(string message)
    {
        CPH.SetArgument("streamBridgeValidationError", message);
        CPH.LogError("THSV StreamBridge receiver rejected an event: " + message);
        return false;
    }

    private static string ReadRequiredString(JObject value, string property)
    {
        string result = value.Value<string>(property);
        return string.IsNullOrWhiteSpace(result) ? null : result;
    }

    private static string ReadOptionalString(JObject value, string property, string fallback = "")
    {
        string result = value.Value<string>(property);
        return string.IsNullOrWhiteSpace(result) ? fallback ?? string.Empty : result;
    }
}
