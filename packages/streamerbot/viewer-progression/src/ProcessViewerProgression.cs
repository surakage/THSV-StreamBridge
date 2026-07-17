using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ContractVersion = "1.0.0";
    private const string PackageVersion = "1.0.0";

    public bool Execute()
    {
        InitializeOutputs();
        if (!CPH.TryGetArg("streamBridgeValid", out bool receiverValid) || !receiverValid) return Fail("The StreamBridge receiver did not validate this event.");
        if (!CPH.TryGetArg("streamBridgeEventType", out string eventType) || eventType != "viewer.progression") return true;
        CPH.SetArgument("viewerProgressionHandled", true);
        if (!CPH.TryGetArg("streamBridgeEventId", out string eventId) || string.IsNullOrWhiteSpace(eventId)) return Fail("Missing validated streamBridgeEventId.");
        if (!CPH.TryGetArg("streamBridgeReceivedAt", out string receivedAt) || string.IsNullOrWhiteSpace(receivedAt)) return Fail("Missing validated streamBridgeReceivedAt.");
        if (!CPH.TryGetArg("streamBridgeSequence", out long sequence) || sequence <= 0) return Fail("Missing validated positive streamBridgeSequence.");
        if (!CPH.TryGetArg("streamBridgePlatform", out string platform) || string.IsNullOrWhiteSpace(platform)) return Fail("Missing validated streamBridgePlatform.");
        if (!CPH.TryGetArg("streamBridgeViewerId", out string trustedViewerId) || !IsIdentifier(trustedViewerId)) return Fail("Missing validated streamBridgeViewerId.");
        if (!CPH.TryGetArg("streamBridgePayload", out string payloadJson) || string.IsNullOrWhiteSpace(payloadJson)) return Fail("Missing validated streamBridgePayload.");

        JObject payload;
        try { payload = JObject.Parse(payloadJson); }
        catch (JsonException) { return Fail("streamBridgePayload is not valid JSON."); }
        string viewerId = ReadString(payload, "viewerId");
        string sourceEventId = ReadString(payload, "sourceEventId");
        string sourceEventType = ReadString(payload, "sourceEventType");
        if (!IsIdentifier(viewerId) || viewerId != trustedViewerId) return Fail("payload.viewerId must match the receiver-validated viewer identity.");
        if (string.IsNullOrWhiteSpace(sourceEventId) || string.IsNullOrWhiteSpace(sourceEventType)) return Fail("Missing progression source event identity.");
        if (!ReadBoolean(payload, "linked", out bool linked) || !ReadBoolean(payload, "leveledUp", out bool leveledUp)) return Fail("Progression boolean fields are invalid.");
        if (!ReadInteger(payload, "pointsAwarded", 1, out long pointsAwarded) || !ReadInteger(payload, "totalPoints", 0, out long totalPoints) || !ReadInteger(payload, "previousLevel", 1, out long previousLevel) || !ReadInteger(payload, "level", 1, out long level)) return Fail("Progression counters must be safe non-negative integers.");
        if (level < previousLevel) return Fail("Progression level cannot decrease.");
        JToken nextToken = payload["nextLevelAt"];
        bool hasNextLevel = nextToken != null && nextToken.Type != JTokenType.Null;
        long nextLevelAt = 0L;
        if (hasNextLevel && !ReadInteger(payload, "nextLevelAt", totalPoints, out nextLevelAt)) return Fail("payload.nextLevelAt must be a safe integer not below totalPoints.");

        CPH.SetArgument("viewerProgressionEventId", eventId);
        CPH.SetArgument("viewerProgressionReceivedAt", receivedAt);
        CPH.SetArgument("viewerProgressionSequence", sequence);
        CPH.SetArgument("viewerProgressionPlatform", platform);
        CPH.SetArgument("viewerProgressionViewerId", viewerId);
        CPH.SetArgument("viewerProgressionLinked", linked);
        CPH.SetArgument("viewerProgressionSourceEventId", sourceEventId);
        CPH.SetArgument("viewerProgressionSourceEventType", sourceEventType);
        CPH.SetArgument("viewerProgressionPointsAwarded", pointsAwarded);
        CPH.SetArgument("viewerProgressionTotalPoints", totalPoints);
        CPH.SetArgument("viewerProgressionPreviousLevel", previousLevel);
        CPH.SetArgument("viewerProgressionLevel", level);
        CPH.SetArgument("viewerProgressionLeveledUp", leveledUp);
        CPH.SetArgument("viewerProgressionHasNextLevel", hasNextLevel);
        CPH.SetArgument("viewerProgressionNextLevelAt", nextLevelAt);
        CPH.SetArgument("viewerProgressionSimulated", ReadArgumentBoolean("streamBridgeSimulated"));
        CPH.SetArgument("viewerProgressionValid", true);
        return true;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("viewerProgressionHandled", false); CPH.SetArgument("viewerProgressionValid", false); CPH.SetArgument("viewerProgressionValidationError", string.Empty);
        CPH.SetArgument("viewerProgressionContractVersion", ContractVersion); CPH.SetArgument("viewerProgressionPackageVersion", PackageVersion);
        CPH.SetArgument("viewerProgressionEventId", string.Empty); CPH.SetArgument("viewerProgressionReceivedAt", string.Empty); CPH.SetArgument("viewerProgressionSequence", 0L);
        CPH.SetArgument("viewerProgressionPlatform", string.Empty); CPH.SetArgument("viewerProgressionViewerId", string.Empty); CPH.SetArgument("viewerProgressionLinked", false);
        CPH.SetArgument("viewerProgressionSourceEventId", string.Empty); CPH.SetArgument("viewerProgressionSourceEventType", string.Empty); CPH.SetArgument("viewerProgressionPointsAwarded", 0L);
        CPH.SetArgument("viewerProgressionTotalPoints", 0L); CPH.SetArgument("viewerProgressionPreviousLevel", 0L); CPH.SetArgument("viewerProgressionLevel", 0L);
        CPH.SetArgument("viewerProgressionLeveledUp", false); CPH.SetArgument("viewerProgressionHasNextLevel", false); CPH.SetArgument("viewerProgressionNextLevelAt", 0L); CPH.SetArgument("viewerProgressionSimulated", false);
    }

    private bool Fail(string message) { CPH.SetArgument("viewerProgressionValidationError", message); CPH.LogError("THSV Viewer Progression rejected an event: " + message); return false; }
    private bool ReadArgumentBoolean(string name) { bool value; return CPH.TryGetArg(name, out value) && value; }
    private static string ReadString(JObject payload, string key) { JToken value = payload[key]; return value != null && value.Type == JTokenType.String ? value.ToString() : string.Empty; }
    private static bool ReadBoolean(JObject payload, string key, out bool result) { result = false; JToken value = payload[key]; return value != null && value.Type == JTokenType.Boolean && bool.TryParse(value.ToString(), out result); }
    private static bool ReadInteger(JObject payload, string key, long minimum, out long result) { result = 0L; JToken value = payload[key]; return value != null && value.Type == JTokenType.Integer && long.TryParse(value.ToString(), out result) && result >= minimum && result <= 9007199254740991L; }
    private static bool IsIdentifier(string value) { if (string.IsNullOrEmpty(value) || value.Length > 64 || value[0] < 'a' || value[0] > 'z') return false; for (int index = 1; index < value.Length; index++) { char item = value[index]; if (!((item >= 'a' && item <= 'z') || (item >= '0' && item <= '9') || item == '-')) return false; } return true; }
}
