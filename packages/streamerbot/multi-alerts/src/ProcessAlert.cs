using System;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ContractVersion = "1.0.0";
    private const string PackageVersion = "1.0.1";
    private const int MaximumTextLength = 500;
    private const long MaximumSafeInteger = 9007199254740991L;

    public bool Execute()
    {
        InitializeOutputs();
        if (!CPH.TryGetArg("streamBridgeValid", out bool receiverValid) || !receiverValid)
            return Fail("The StreamBridge receiver did not validate this event.");
        if (!CPH.TryGetArg("streamBridgeEventType", out string eventType)) return true;
        string alertType = GetAlertType(eventType);
        if (alertType == null) return true;

        CPH.SetArgument("multiAlertHandled", true);
        if (!CPH.TryGetArg("streamBridgeEventId", out string eventId) || string.IsNullOrWhiteSpace(eventId)) return Fail("Missing validated streamBridgeEventId.");
        if (!CPH.TryGetArg("streamBridgeReceivedAt", out string receivedAt) || string.IsNullOrWhiteSpace(receivedAt)) return Fail("Missing validated streamBridgeReceivedAt.");
        if (!CPH.TryGetArg("streamBridgeSequence", out long sequence) || sequence <= 0) return Fail("Missing validated positive streamBridgeSequence.");
        if (!CPH.TryGetArg("streamBridgePlatform", out string platform) || string.IsNullOrWhiteSpace(platform)) return Fail("Missing validated streamBridgePlatform.");
        if (!CPH.TryGetArg("streamBridgeChannelName", out string channelName) || string.IsNullOrWhiteSpace(channelName)) return Fail("Missing validated streamBridgeChannelName.");
        if (!CPH.TryGetArg("streamBridgePayload", out string payloadJson) || string.IsNullOrWhiteSpace(payloadJson)) return Fail("Missing validated streamBridgePayload.");

        JObject payload;
        try { payload = JObject.Parse(payloadJson); }
        catch (JsonException) { return Fail("streamBridgePayload is not valid JSON."); }

        string userName = ReadOptionalArgument("streamBridgeUserName");
        string actorType = ReadOptionalArgument("streamBridgeUserActorType", "human");
        bool hasActor = !string.IsNullOrWhiteSpace(userName);
        if (alertType != "milestone" && !hasActor) return Fail(eventType + " requires validated user data.");
        if (hasActor && actorType != "human" && actorType != "bot") return Fail(eventType + " requires a human or bot actor.");

        string amount;
        if (!ReadOptionalAmount(payload, out amount)) return Fail("payload.amount must be a non-negative decimal string with bounded precision.");
        string currency;
        if (!ReadOptionalCurrency(payload, out currency)) return Fail("payload.currency must be an uppercase three-letter ISO code.");
        long quantity;
        if (!ReadOptionalInteger(payload, "quantity", true, out quantity)) return Fail("payload.quantity must be a positive safe integer.");
        string itemName;
        if (!ReadOptionalText(payload, "itemName", out itemName)) return Fail("payload.itemName must be non-empty plain text of at most 500 characters.");
        string tier;
        if (!ReadOptionalText(payload, "tier", out tier)) return Fail("payload.tier must be non-empty plain text of at most 500 characters.");
        string message;
        if (!ReadOptionalText(payload, "message", out message)) return Fail("payload.message must be non-empty plain text of at most 500 characters.");
        string metric;
        if (!ReadOptionalIdentifier(payload, "metric", out metric)) return Fail("payload.metric must be a lowercase identifier.");
        long value;
        if (!ReadOptionalInteger(payload, "value", false, out value)) return Fail("payload.value must be a non-negative safe integer.");

        if ((alertType == "donation" || alertType == "super-chat") && (amount.Length == 0 || currency.Length == 0))
            return Fail(eventType + " requires decimal-string payload.amount and ISO payload.currency.");
        if (alertType == "gift" && (itemName.Length == 0 || quantity <= 0)) return Fail("engagement.gift requires payload.itemName and positive integer payload.quantity.");
        if ((alertType == "gift-subscription" || alertType == "raid") && quantity <= 0) return Fail(eventType + " requires positive integer payload.quantity.");
        if (alertType == "cheer" && quantity <= 0 && amount.Length == 0) return Fail("engagement.cheer requires payload.quantity or payload.amount.");
        if (alertType == "milestone" && (metric.Length == 0 || value < 0)) return Fail("engagement.milestone requires payload.metric and non-negative integer payload.value.");

        string rolesJson = ReadOptionalArgument("streamBridgeUserRoles", "[]");
        JArray roles;
        try { roles = JArray.Parse(rolesJson); }
        catch (JsonException) { return Fail("streamBridgeUserRoles is not a valid JSON array."); }
        JArray unverifiedFields;
        if (!ReadUnverifiedFields(out unverifiedFields)) return Fail("streamBridgeMetadata.unverifiedFields is not a valid string array.");

        CPH.SetArgument("multiAlertEventId", eventId);
        CPH.SetArgument("multiAlertReceivedAt", receivedAt);
        CPH.SetArgument("multiAlertSequence", sequence);
        CPH.SetArgument("multiAlertVisibility", "public");
        CPH.SetArgument("multiAlertType", alertType);
        CPH.SetArgument("multiAlertPlatform", platform);
        CPH.SetArgument("multiAlertChannelId", ReadOptionalArgument("streamBridgeChannelId"));
        CPH.SetArgument("multiAlertChannelName", channelName);
        CPH.SetArgument("multiAlertHasActor", hasActor);
        CPH.SetArgument("multiAlertActorId", ReadOptionalArgument("streamBridgeUserId"));
        CPH.SetArgument("multiAlertActorName", userName);
        CPH.SetArgument("multiAlertActorDisplayName", ReadOptionalArgument("streamBridgeUserDisplayName", userName));
        CPH.SetArgument("multiAlertActorType", hasActor ? actorType : string.Empty);
        CPH.SetArgument("multiAlertActorRoles", hasActor ? roles.ToString(Formatting.None) : "[]");
        CPH.SetArgument("multiAlertAmount", amount);
        CPH.SetArgument("multiAlertCurrency", currency);
        CPH.SetArgument("multiAlertQuantity", quantity);
        CPH.SetArgument("multiAlertItemName", itemName);
        CPH.SetArgument("multiAlertTier", tier);
        CPH.SetArgument("multiAlertMessage", message);
        CPH.SetArgument("multiAlertMetric", metric);
        CPH.SetArgument("multiAlertValue", value);
        CPH.SetArgument("multiAlertSimulated", ReadBooleanArgument("streamBridgeSimulated"));
        CPH.SetArgument("multiAlertVerifiedTransport", unverifiedFields.Count == 0);
        CPH.SetArgument("multiAlertUnverifiedFields", unverifiedFields.ToString(Formatting.None));
        CPH.SetArgument("multiAlertValid", true);
        return true;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("multiAlertHandled", false);
        CPH.SetArgument("multiAlertValid", false);
        CPH.SetArgument("multiAlertValidationError", string.Empty);
        CPH.SetArgument("multiAlertContractVersion", ContractVersion);
        CPH.SetArgument("multiAlertPackageVersion", PackageVersion);
        CPH.SetArgument("multiAlertEventId", string.Empty);
        CPH.SetArgument("multiAlertReceivedAt", string.Empty);
        CPH.SetArgument("multiAlertSequence", 0L);
        CPH.SetArgument("multiAlertVisibility", string.Empty);
        CPH.SetArgument("multiAlertType", string.Empty);
        CPH.SetArgument("multiAlertPlatform", string.Empty);
        CPH.SetArgument("multiAlertChannelId", string.Empty);
        CPH.SetArgument("multiAlertChannelName", string.Empty);
        CPH.SetArgument("multiAlertHasActor", false);
        CPH.SetArgument("multiAlertActorId", string.Empty);
        CPH.SetArgument("multiAlertActorName", string.Empty);
        CPH.SetArgument("multiAlertActorDisplayName", string.Empty);
        CPH.SetArgument("multiAlertActorType", string.Empty);
        CPH.SetArgument("multiAlertActorRoles", "[]");
        CPH.SetArgument("multiAlertAmount", string.Empty);
        CPH.SetArgument("multiAlertCurrency", string.Empty);
        CPH.SetArgument("multiAlertQuantity", 0L);
        CPH.SetArgument("multiAlertItemName", string.Empty);
        CPH.SetArgument("multiAlertTier", string.Empty);
        CPH.SetArgument("multiAlertMessage", string.Empty);
        CPH.SetArgument("multiAlertMetric", string.Empty);
        CPH.SetArgument("multiAlertValue", -1L);
        CPH.SetArgument("multiAlertSimulated", false);
        CPH.SetArgument("multiAlertVerifiedTransport", false);
        CPH.SetArgument("multiAlertUnverifiedFields", "[]");
    }

    private bool Fail(string message)
    {
        CPH.SetArgument("multiAlertValidationError", message);
        CPH.LogError("THSV Multi-Alerts rejected an event: " + message);
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

    private bool ReadUnverifiedFields(out JArray fields)
    {
        fields = new JArray();
        string metadataJson = ReadOptionalArgument("streamBridgeMetadata", "{}");
        try
        {
            JObject metadata = JObject.Parse(metadataJson);
            JToken token = metadata["unverifiedFields"];
            if (token == null) return true;
            JArray array = token as JArray;
            if (array == null) return false;
            foreach (JToken item in array) if (item.Type != JTokenType.String) return false;
            fields = array;
            return true;
        }
        catch (JsonException) { return false; }
    }

    private static string GetAlertType(string eventType)
    {
        if (eventType == "channel.follow") return "follow";
        if (eventType == "channel.subscription") return "subscription";
        if (eventType == "channel.membership") return "membership";
        if (eventType == "channel.gift-subscription") return "gift-subscription";
        if (eventType == "engagement.gift") return "gift";
        if (eventType == "engagement.donation") return "donation";
        if (eventType == "engagement.cheer") return "cheer";
        if (eventType == "engagement.super-chat") return "super-chat";
        if (eventType == "channel.raid") return "raid";
        if (eventType == "engagement.milestone") return "milestone";
        return null;
    }

    private static bool ReadOptionalAmount(JObject payload, out string value)
    {
        JToken token = payload["amount"];
        value = token == null ? string.Empty : token.ToString();
        return token == null || token.Type == JTokenType.String && IsAmount(value);
    }

    private static bool IsAmount(string value)
    {
        if (value.Length == 0 || value.Length > 19) return false;
        int decimalIndex = value.IndexOf('.');
        string integer = decimalIndex < 0 ? value : value.Substring(0, decimalIndex);
        string fraction = decimalIndex < 0 ? string.Empty : value.Substring(decimalIndex + 1);
        if (integer.Length == 0 || integer.Length > 12 || fraction.Length > 6 || decimalIndex >= 0 && fraction.Length == 0) return false;
        if (integer.Length > 1 && integer[0] == '0') return false;
        return IsDigits(integer) && (fraction.Length == 0 || IsDigits(fraction));
    }

    private static bool ReadOptionalCurrency(JObject payload, out string value)
    {
        JToken token = payload["currency"];
        value = token == null ? string.Empty : token.ToString();
        if (token == null) return true;
        if (token.Type != JTokenType.String || value.Length != 3) return false;
        foreach (char character in value) if (character < 'A' || character > 'Z') return false;
        return true;
    }

    private static bool ReadOptionalInteger(JObject payload, string key, bool positive, out long value)
    {
        JToken token = payload[key];
        value = positive ? 0L : -1L;
        if (token == null) return true;
        long parsed;
        if (token.Type != JTokenType.Integer || !long.TryParse(token.ToString(), out parsed) || parsed > MaximumSafeInteger) return false;
        if (positive && parsed <= 0 || !positive && parsed < 0) return false;
        value = parsed;
        return true;
    }

    private static bool ReadOptionalText(JObject payload, string key, out string value)
    {
        JToken token = payload[key];
        value = string.Empty;
        if (token == null) return true;
        if (token.Type != JTokenType.String) return false;
        value = NormalizePlainText(token.ToString());
        return value.Length > 0 && value.Length <= MaximumTextLength;
    }

    private static bool ReadOptionalIdentifier(JObject payload, string key, out string value)
    {
        JToken token = payload[key];
        value = token == null ? string.Empty : token.ToString();
        if (token == null) return true;
        if (token.Type != JTokenType.String || value.Length == 0 || value.Length > 64 || value[0] < 'a' || value[0] > 'z') return false;
        for (int index = 1; index < value.Length; index++)
        {
            char character = value[index];
            if (!((character >= 'a' && character <= 'z') || (character >= '0' && character <= '9') || character == '-')) return false;
        }
        return true;
    }

    private static bool IsDigits(string value)
    {
        foreach (char character in value) if (character < '0' || character > '9') return false;
        return true;
    }

    private static string NormalizePlainText(string input)
    {
        StringBuilder result = new StringBuilder(input.Length);
        bool pendingSpace = false;
        foreach (char character in input)
        {
            if (char.IsControl(character) || char.IsWhiteSpace(character)) { pendingSpace = result.Length > 0; continue; }
            if (pendingSpace) { result.Append(' '); pendingSpace = false; }
            result.Append(character);
        }
        return result.ToString();
    }
}
