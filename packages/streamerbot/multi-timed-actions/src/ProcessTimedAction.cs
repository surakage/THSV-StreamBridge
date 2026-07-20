// Purpose: Validates timed events, exposes their selection data, and optionally dispatches one approved action.
// Trust boundary: creator action dispatch requires a pinned UUID, explicit approval, and recursion checks.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ContractVersion = "1.0.0";
    private const string PackageVersion = "1.3.0";
    private const string ThisActionId = "f021d77f-7eb8-55d8-87dd-d681c439dfef";
    private const long MaximumSafeInteger = 9007199254740991L;
    private const int MaximumPayloadLength = 65536;

    public bool Execute()
    {
        // Timed events must first pass through the Core Receiver trust boundary.
        InitializeOutputs();
        if (!CPH.TryGetArg("streamBridgeValid", out bool receiverValid) || !receiverValid) return Fail("The StreamBridge receiver did not validate this event.");
        if (!CPH.TryGetArg("streamBridgeEventType", out string eventType) || eventType != "system.timed") return true;
        CPH.SetArgument("multiTimedHandled", true);

        if (!CPH.TryGetArg("streamBridgeEventId", out string eventId) || string.IsNullOrWhiteSpace(eventId)) return Fail("Missing validated streamBridgeEventId.");
        if (!CPH.TryGetArg("streamBridgeReceivedAt", out string receivedAt) || !IsTimestamp(receivedAt)) return Fail("Missing or invalid streamBridgeReceivedAt.");
        if (!CPH.TryGetArg("streamBridgeSequence", out long sequence) || sequence <= 0) return Fail("Missing validated positive streamBridgeSequence.");
        if (!CPH.TryGetArg("streamBridgePlatform", out string platform) || string.IsNullOrWhiteSpace(platform)) return Fail("Missing validated streamBridgePlatform.");
        if (!CPH.TryGetArg("streamBridgePayload", out string payloadJson) || string.IsNullOrWhiteSpace(payloadJson)) return Fail("Missing validated streamBridgePayload.");
        if (payloadJson.Length > MaximumPayloadLength) return Fail("streamBridgePayload exceeds the Multi-Timed Actions input limit.");

        JObject payload;
        try
        {
            using (JsonTextReader reader = new JsonTextReader(new StringReader(payloadJson)))
            {
                reader.DateParseHandling = DateParseHandling.None;
                reader.MaxDepth = 16;
                payload = JObject.Load(reader);
            }
        }
        catch (JsonException) { return Fail("streamBridgePayload is not valid JSON."); }

        string timerId;
        if (!ReadIdentifier(payload, "timerId", out timerId)) return Fail("payload.timerId must be a bounded lowercase identifier.");
        string timerName;
        if (!ReadText(payload, "timerName", 100, out timerName)) return Fail("payload.timerName must contain 1-100 plain-text characters.");
        string scheduleType = ReadString(payload, "scheduleType");
        if (scheduleType != "session-interval") return Fail("payload.scheduleType must be session-interval.");
        string scheduledAt = ReadString(payload, "scheduledAt");
        string firedAt = ReadString(payload, "firedAt");
        if (!IsTimestamp(scheduledAt) || !IsTimestamp(firedAt)) return Fail("payload scheduledAt and firedAt must be ISO 8601 timestamps.");
        long occurrence;
        if (!ReadInteger(payload, "occurrence", 1, out occurrence)) return Fail("payload.occurrence must be a positive safe integer.");
        long missedRuns;
        if (!ReadInteger(payload, "missedRuns", 0, out missedRuns)) return Fail("payload.missedRuns must be a non-negative safe integer.");
        JObject creatorPayload = payload["creatorPayload"] as JObject;
        if (creatorPayload == null) return Fail("payload.creatorPayload must be an object.");
        string selectionMode = ReadString(payload, "selectionMode");
        if (selectionMode != "fixed" && selectionMode != "shuffle-container" && selectionMode != "platform-shuffle") return Fail("payload.selectionMode must be fixed, shuffle-container, or platform-shuffle.");
        string selectedMessage = string.Empty;
        if (selectionMode != "fixed" && !ReadText(payload, "selectedMessage", 500, out selectedMessage)) return Fail("payload.selectedMessage must contain 1-500 creator-authored plain-text characters.");
        JObject selectedMessages = payload["selectedMessages"] as JObject ?? new JObject();
        if (selectionMode == "platform-shuffle" && !ReadPlatformMessages(selectedMessages)) return Fail("payload.selectedMessages must contain bounded messages for supported platforms.");
        long containerCycle, containerPosition, containerSize;
        if (!ReadInteger(payload, "containerCycle", 0, out containerCycle) || !ReadInteger(payload, "containerPosition", 0, out containerPosition) || !ReadInteger(payload, "containerSize", 0, out containerSize)) return Fail("payload container counters must be non-negative safe integers.");
        string targetProvider = ReadString(payload, "targetProvider");
        if (targetProvider != "event-only" && targetProvider != "run-existing-action") return Fail("payload.targetProvider must be event-only or run-existing-action.");
        string targetActionId = string.Empty;
        string targetActionName = string.Empty;
        if (targetProvider == "run-existing-action")
        {
            targetActionId = ReadString(payload, "targetActionId");
            targetActionName = ReadString(payload, "targetActionName");
            Guid parsedActionId;
            if (!Guid.TryParse(targetActionId, out parsedActionId) || targetActionId == ThisActionId) return Fail("payload.targetActionId must identify a different Streamer.bot action.");
            if (targetActionName.Length == 0 || targetActionName.Length > 200) return Fail("payload.targetActionName must contain 1-200 characters.");
            JToken approved = payload["targetActionApproved"];
            if (approved == null || approved.Type != JTokenType.Boolean || !string.Equals(approved.ToString(), "true", StringComparison.OrdinalIgnoreCase)) return Fail("Running a selected action requires explicit creator approval.");
        }
        JArray deliveryPlatforms = payload["deliveryPlatforms"] as JArray;
        if (!ReadDeliveryPlatforms(deliveryPlatforms)) return Fail("payload.deliveryPlatforms must contain only unique twitch, youtube, kick, or tiktok values.");

        DateTimeOffset scheduled = DateTimeOffset.Parse(scheduledAt);
        DateTimeOffset fired = DateTimeOffset.Parse(firedAt);
        long lateByMs = Math.Max(0L, (long)(fired - scheduled).TotalMilliseconds);
        CPH.SetArgument("multiTimedEventId", eventId);
        CPH.SetArgument("multiTimedCorrelationId", ReadArgument("streamBridgeCorrelationId"));
        CPH.SetArgument("multiTimedPlatform", platform);
        CPH.SetArgument("multiTimedReceivedAt", receivedAt);
        CPH.SetArgument("multiTimedSequence", sequence);
        CPH.SetArgument("multiTimedTimerId", timerId);
        CPH.SetArgument("multiTimedTimerName", timerName);
        CPH.SetArgument("multiTimedScheduleType", scheduleType);
        CPH.SetArgument("multiTimedScheduledAt", scheduledAt);
        CPH.SetArgument("multiTimedFiredAt", firedAt);
        CPH.SetArgument("multiTimedOccurrence", occurrence);
        CPH.SetArgument("multiTimedMissedRuns", missedRuns);
        CPH.SetArgument("multiTimedLateByMs", lateByMs);
        CPH.SetArgument("multiTimedSelectionMode", selectionMode);
        CPH.SetArgument("multiTimedSelectedMessage", selectedMessage);
        CPH.SetArgument("multiTimedSelectedMessages", selectedMessages.ToString(Formatting.None));
        CPH.SetArgument("multiTimedContainerCycle", containerCycle);
        CPH.SetArgument("multiTimedContainerPosition", containerPosition);
        CPH.SetArgument("multiTimedContainerSize", containerSize);
        CPH.SetArgument("multiTimedSimulated", ReadBoolean("streamBridgeSimulated"));
        CPH.SetArgument("multiTimedCreatorPayload", creatorPayload.ToString(Formatting.None));
        CPH.SetArgument("multiTimedTargetProvider", targetProvider);
        CPH.SetArgument("multiTimedTargetActionId", targetActionId);
        CPH.SetArgument("multiTimedTargetActionName", targetActionName);
        CPH.SetArgument("multiTimedDeliveryPlatforms", deliveryPlatforms.ToString(Formatting.None));
        if (targetProvider == "run-existing-action")
        {
            try
            {
                bool dispatched = CPH.RunActionById(targetActionId, false);
                CPH.SetArgument("multiTimedActionDispatched", dispatched);
                if (!dispatched) CPH.LogWarn("THSV Multi-Timed Actions could not dispatch the selected action.");
            }
            catch (Exception error)
            {
                CPH.LogError("THSV Multi-Timed Actions dispatch failed (" + error.GetType().Name + ").");
                return Fail("The selected Streamer.bot action could not be dispatched.");
            }
        }
        CPH.SetArgument("multiTimedValid", true);
        return true;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("multiTimedHandled", false); CPH.SetArgument("multiTimedValid", false); CPH.SetArgument("multiTimedValidationError", string.Empty);
        CPH.SetArgument("multiTimedContractVersion", ContractVersion); CPH.SetArgument("multiTimedPackageVersion", PackageVersion);
        CPH.SetArgument("multiTimedEventId", string.Empty); CPH.SetArgument("multiTimedCorrelationId", string.Empty); CPH.SetArgument("multiTimedPlatform", string.Empty);
        CPH.SetArgument("multiTimedReceivedAt", string.Empty); CPH.SetArgument("multiTimedSequence", 0L); CPH.SetArgument("multiTimedTimerId", string.Empty);
        CPH.SetArgument("multiTimedTimerName", string.Empty); CPH.SetArgument("multiTimedScheduleType", string.Empty); CPH.SetArgument("multiTimedScheduledAt", string.Empty);
        CPH.SetArgument("multiTimedFiredAt", string.Empty); CPH.SetArgument("multiTimedOccurrence", 0L); CPH.SetArgument("multiTimedMissedRuns", 0L);
        CPH.SetArgument("multiTimedLateByMs", 0L); CPH.SetArgument("multiTimedSimulated", false); CPH.SetArgument("multiTimedCreatorPayload", "{}");
        CPH.SetArgument("multiTimedSelectionMode", string.Empty); CPH.SetArgument("multiTimedSelectedMessage", string.Empty); CPH.SetArgument("multiTimedSelectedMessages", "{}"); CPH.SetArgument("multiTimedContainerCycle", 0L);
        CPH.SetArgument("multiTimedContainerPosition", 0L); CPH.SetArgument("multiTimedContainerSize", 0L);
        CPH.SetArgument("multiTimedTargetProvider", string.Empty); CPH.SetArgument("multiTimedTargetActionId", string.Empty); CPH.SetArgument("multiTimedTargetActionName", string.Empty);
        CPH.SetArgument("multiTimedDeliveryPlatforms", "[]");
        CPH.SetArgument("multiTimedActionDispatched", false);
    }

    private bool Fail(string message) { CPH.SetArgument("multiTimedValidationError", message); CPH.LogError("THSV Multi-Timed Actions rejected an event: " + message); return false; }
    private string ReadArgument(string name) { string value; return CPH.TryGetArg(name, out value) && value != null ? value : string.Empty; }
    private bool ReadBoolean(string name) { bool value; return CPH.TryGetArg(name, out value) && value; }
    private static string ReadString(JObject value, string key) { JToken token = value[key]; return token != null && token.Type == JTokenType.String ? token.ToString() : string.Empty; }
    private static bool IsTimestamp(string value) { DateTimeOffset parsed; return !string.IsNullOrWhiteSpace(value) && DateTimeOffset.TryParse(value, out parsed); }
    private static bool ReadInteger(JObject value, string key, long minimum, out long result) { result = 0L; JToken token = value[key]; return token != null && token.Type == JTokenType.Integer && long.TryParse(token.ToString(), out result) && result >= minimum && result <= MaximumSafeInteger; }

    private static bool ReadIdentifier(JObject value, string key, out string result)
    {
        result = ReadString(value, key);
        if (result.Length == 0 || result.Length > 64 || result[0] < 'a' || result[0] > 'z') return false;
        for (int index = 1; index < result.Length; index++) { char item = result[index]; if (!((item >= 'a' && item <= 'z') || (item >= '0' && item <= '9') || item == '-')) return false; }
        return true;
    }

    private static bool ReadText(JObject value, string key, int maximum, out string result)
    {
        string input = ReadString(value, key); StringBuilder normalized = new StringBuilder(input.Length); bool space = false;
        foreach (char item in input) { if (char.IsControl(item) || char.IsWhiteSpace(item)) { space = normalized.Length > 0; continue; } if (space) { normalized.Append(' '); space = false; } normalized.Append(item); }
        result = normalized.ToString(); return result.Length > 0 && result.Length <= maximum;
    }

    private static bool ReadDeliveryPlatforms(JArray value)
    {
        if (value == null || value.Count > 4) return false;
        System.Collections.Generic.List<string> seen = new System.Collections.Generic.List<string>();
        foreach (JToken token in value)
        {
            if (token.Type != JTokenType.String) return false;
            string platform = token.ToString();
            if (platform != "twitch" && platform != "youtube" && platform != "kick" && platform != "tiktok") return false;
            if (seen.Contains(platform)) return false;
            seen.Add(platform);
        }
        return true;
    }

    private static bool ReadPlatformMessages(JObject value)
    {
        if (value == null || value.Count == 0 || value.Count > 4) return false;
        foreach (JProperty property in value.Properties())
        {
            int maximum = property.Name == "youtube" ? 200 : property.Name == "tiktok" ? 150 : property.Name == "twitch" || property.Name == "kick" ? 500 : 0;
            if (maximum == 0 || property.Value.Type != JTokenType.String) return false;
            string input = property.Value.ToString(); if (input.Length == 0 || input.Length > maximum) return false;
            foreach (char item in input) if (char.IsControl(item)) return false;
        }
        return true;
    }
}
