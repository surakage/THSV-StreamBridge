using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ContractVersion = "1.0.0";
    private const string PackageVersion = "1.1.0";

    public bool Execute()
    {
        InitializeOutputs();
        if (!CPH.TryGetArg("streamBridgeValid", out bool receiverValid) || !receiverValid) return Fail("The StreamBridge receiver did not validate this event.");
        if (!CPH.TryGetArg("streamBridgeEventType", out string eventType) || eventType != "companion.action") return true;
        CPH.SetArgument("companionHandled", true);
        if (!CPH.TryGetArg("streamBridgeEventId", out string eventId) || string.IsNullOrWhiteSpace(eventId)) return Fail("Missing validated streamBridgeEventId.");
        if (!CPH.TryGetArg("streamBridgeReceivedAt", out string receivedAt) || string.IsNullOrWhiteSpace(receivedAt)) return Fail("Missing validated streamBridgeReceivedAt.");
        if (!CPH.TryGetArg("streamBridgeSequence", out long sequence) || sequence <= 0) return Fail("Missing validated positive streamBridgeSequence.");
        if (!CPH.TryGetArg("streamBridgePlatform", out string platform) || string.IsNullOrWhiteSpace(platform)) return Fail("Missing validated streamBridgePlatform.");
        if (!CPH.TryGetArg("streamBridgePayload", out string payloadJson) || string.IsNullOrWhiteSpace(payloadJson)) return Fail("Missing validated streamBridgePayload.");
        JObject payload;
        try { payload = JObject.Parse(payloadJson); }
        catch (JsonException) { return Fail("streamBridgePayload is not valid JSON."); }
        string action = ReadString(payload, "action");
        string actorName = ReadString(payload, "actorName");
        if (action != "wave" && action != "eat" && action != "sleep" && action != "wake" && action != "celebrate") return Fail("payload.action is not a supported Bloom action.");
        if (string.IsNullOrWhiteSpace(actorName) || actorName.Length > 256) return Fail("payload.actorName is invalid.");
        if (!ReadInteger(payload, "cost", 0, 1000000, out long cost) || !ReadInteger(payload, "remainingPoints", 0, 9007199254740991L, out long remaining) || !ReadInteger(payload, "happiness", 0, 100, out long happiness) || !ReadInteger(payload, "fullness", 0, 100, out long fullness) || !ReadInteger(payload, "energy", 0, 100, out long energy) || !ReadBoolean(payload, "sleeping", out bool sleeping)) return Fail("Companion counters or sleep state are invalid.");
        CPH.SetArgument("companionEventId", eventId); CPH.SetArgument("companionReceivedAt", receivedAt); CPH.SetArgument("companionSequence", sequence); CPH.SetArgument("companionPlatform", platform);
        CPH.SetArgument("companionAction", action); CPH.SetArgument("companionActorName", actorName); CPH.SetArgument("companionCost", cost); CPH.SetArgument("companionRemainingPoints", remaining);
        CPH.SetArgument("companionHappiness", happiness); CPH.SetArgument("companionFullness", fullness); CPH.SetArgument("companionEnergy", energy); CPH.SetArgument("companionSleeping", sleeping); CPH.SetArgument("companionSimulated", ReadArgumentBoolean("streamBridgeSimulated"));
        CPH.SetArgument("companionValid", true);
        return true;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("companionHandled", false); CPH.SetArgument("companionValid", false); CPH.SetArgument("companionValidationError", string.Empty); CPH.SetArgument("companionContractVersion", ContractVersion); CPH.SetArgument("companionPackageVersion", PackageVersion);
        CPH.SetArgument("companionEventId", string.Empty); CPH.SetArgument("companionReceivedAt", string.Empty); CPH.SetArgument("companionSequence", 0L); CPH.SetArgument("companionPlatform", string.Empty); CPH.SetArgument("companionAction", string.Empty); CPH.SetArgument("companionActorName", string.Empty);
        CPH.SetArgument("companionCost", 0L); CPH.SetArgument("companionRemainingPoints", 0L); CPH.SetArgument("companionHappiness", 0L); CPH.SetArgument("companionFullness", 0L); CPH.SetArgument("companionEnergy", 0L); CPH.SetArgument("companionSleeping", false); CPH.SetArgument("companionSimulated", false);
    }

    private bool Fail(string message) { CPH.SetArgument("companionValidationError", message); CPH.LogError("THSV Bloom Companion rejected an event: " + message); return false; }
    private bool ReadArgumentBoolean(string name) { bool value; return CPH.TryGetArg(name, out value) && value; }
    private static string ReadString(JObject payload, string key) { JToken value = payload[key]; return value != null && value.Type == JTokenType.String ? value.ToString() : string.Empty; }
    private static bool ReadBoolean(JObject payload, string key, out bool result) { result = false; JToken value = payload[key]; return value != null && value.Type == JTokenType.Boolean && bool.TryParse(value.ToString(), out result); }
    private static bool ReadInteger(JObject payload, string key, long minimum, long maximum, out long result) { result = 0L; JToken value = payload[key]; return value != null && value.Type == JTokenType.Integer && long.TryParse(value.ToString(), out result) && result >= minimum && result <= maximum; }
}
