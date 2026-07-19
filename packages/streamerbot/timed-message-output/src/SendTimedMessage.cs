using System;
using System.Collections.Generic;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string PackageVersion = "1.1.0";

    public bool Execute()
    {
        InitializeOutputs();
        if (!CPH.TryGetArg("multiTimedValid", out bool valid) || !valid) return Fail("Multi-Timed Actions did not validate this execution.");
        CPH.SetArgument("timedMessageHandled", true);

        string rawMessage;
        CPH.TryGetArg("multiTimedSelectedMessage", out rawMessage);
        string message = Normalize(rawMessage);
        if (message.Length > 500) return Fail("multiTimedSelectedMessage must contain no more than 500 creator-authored plain-text characters.");
        Dictionary<string, string> platformMessages = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        string selectedMessagesJson;
        if (CPH.TryGetArg("multiTimedSelectedMessages", out selectedMessagesJson) && !String.IsNullOrWhiteSpace(selectedMessagesJson))
        {
            try { foreach (JProperty property in JObject.Parse(selectedMessagesJson).Properties()) platformMessages[property.Name] = Normalize(property.Value.ToString()); }
            catch (JsonException) { return Fail("multiTimedSelectedMessages is not a valid JSON object."); }
        }
        if (message.Length == 0 && platformMessages.Count == 0) return Fail("No shared or platform-specific timed message was selected.");

        if (!CPH.TryGetArg("multiTimedDeliveryPlatforms", out string platformsJson) || string.IsNullOrWhiteSpace(platformsJson)) return Fail("Missing multiTimedDeliveryPlatforms.");
        List<string> platforms;
        try { platforms = ParsePlatforms(JArray.Parse(platformsJson)); }
        catch (JsonException) { return Fail("multiTimedDeliveryPlatforms is not a valid JSON array."); }
        catch (ArgumentException error) { return Fail(error.Message); }
        if (platforms.Count == 0) return Fail("Select at least one timed-message delivery platform in the wizard.");

        string requestedJson = JsonConvert.SerializeObject(platforms);
        CPH.SetArgument("timedMessageRequestedPlatforms", requestedJson);
        bool simulated = CPH.TryGetArg("multiTimedSimulated", out bool simulatedValue) && simulatedValue;
        CPH.SetArgument("timedMessageSimulated", simulated);
        CPH.SetArgument("timedMessageValid", true);
        if (simulated)
        {
            CPH.SetArgument("timedMessageDispatchSuppressed", true);
            CPH.SetArgument("timedMessageDispatchComplete", true);
            CPH.LogInfo("THSV Timed Message Output validated a simulated message for " + string.Join(", ", platforms) + "; no external chat message was sent.");
            return true;
        }

        List<string> dispatched = new List<string>();
        List<string> failed = new List<string>();
        foreach (string platform in platforms)
        {
            try
            {
                string platformMessage = platformMessages.ContainsKey(platform) ? platformMessages[platform] : message;
                int maximum = platform == "youtube" ? 200 : platform == "tiktok" ? 150 : 500;
                if (platformMessage.Length == 0 || platformMessage.Length > maximum) throw new ArgumentException(platform + " message must contain 1-" + maximum + " characters.");
                Send(platform, platformMessage);
                dispatched.Add(platform);
            }
            catch (Exception error)
            {
                failed.Add(platform);
                CPH.LogError("THSV Timed Message Output could not dispatch to " + platform + ": " + error.Message);
            }
        }
        CPH.SetArgument("timedMessageDispatchedPlatforms", JsonConvert.SerializeObject(dispatched));
        CPH.SetArgument("timedMessageFailedPlatforms", JsonConvert.SerializeObject(failed));
        CPH.SetArgument("timedMessageDispatchComplete", failed.Count == 0);
        return failed.Count == 0;
    }

    private void Send(string platform, string message)
    {
        if (platform == "twitch") { CPH.SendMessage(message, true, true); return; }
        if (platform == "youtube") { CPH.SendYouTubeMessageToLatestMonitored(message, true, true); return; }
        if (platform == "kick") { CPH.SendKickMessage(message, true, true); return; }
        if (platform == "tiktok")
        {
            JObject payload = new JObject();
            payload["action"] = "sendChatbotMessage";
            payload["args"] = new JObject { ["message"] = message };
            CPH.WebsocketBroadcastJson(payload.ToString(Formatting.None));
            return;
        }
        throw new ArgumentException("Unsupported platform: " + platform);
    }

    private static List<string> ParsePlatforms(JArray input)
    {
        if (input.Count > 4) throw new ArgumentException("Select no more than four timed-message delivery platforms.");
        List<string> result = new List<string>();
        foreach (JToken token in input)
        {
            if (token.Type != JTokenType.String) throw new ArgumentException("Timed-message delivery platforms must be strings.");
            string platform = token.ToString();
            if (platform != "twitch" && platform != "youtube" && platform != "kick" && platform != "tiktok") throw new ArgumentException("Unsupported timed-message delivery platform: " + platform);
            if (result.Contains(platform)) throw new ArgumentException("Timed-message delivery platforms must be unique.");
            result.Add(platform);
        }
        return result;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("timedMessageHandled", false); CPH.SetArgument("timedMessageValid", false); CPH.SetArgument("timedMessageValidationError", string.Empty);
        CPH.SetArgument("timedMessagePackageVersion", PackageVersion); CPH.SetArgument("timedMessageRequestedPlatforms", "[]");
        CPH.SetArgument("timedMessageDispatchedPlatforms", "[]"); CPH.SetArgument("timedMessageFailedPlatforms", "[]");
        CPH.SetArgument("timedMessageSimulated", false); CPH.SetArgument("timedMessageDispatchSuppressed", false); CPH.SetArgument("timedMessageDispatchComplete", false);
    }

    private bool Fail(string message) { CPH.SetArgument("timedMessageValidationError", message); CPH.LogError("THSV Timed Message Output rejected an execution: " + message); return false; }

    private static string Normalize(string input)
    {
        if (input == null) return string.Empty;
        StringBuilder result = new StringBuilder(input.Length); bool space = false;
        foreach (char item in input) { if (char.IsControl(item) || char.IsWhiteSpace(item)) { space = result.Length > 0; continue; } if (space) { result.Append(' '); space = false; } result.Append(item); }
        return result.ToString();
    }
}
