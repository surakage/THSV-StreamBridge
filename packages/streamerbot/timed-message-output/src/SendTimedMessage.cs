// Purpose: Sends one validated timed message to the creator-selected live-chat platforms.
// Trust boundary: simulated events never send externally; platform text and lengths are revalidated here.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string PackageVersion = "1.1.0";
    private const int MaximumPlatformMessageJsonLength = 4096;

    public bool Execute()
    {
        // Consume only the Multi-Timed Actions contract and initialize explicit delivery results.
        InitializeOutputs();
        if (!CPH.TryGetArg("multiTimedValid", out bool valid) || !valid) return Fail("Multi-Timed Actions did not validate this execution.");
        CPH.SetArgument("timedMessageHandled", true);

        string rawMessage;
        CPH.TryGetArg("multiTimedSelectedMessage", out rawMessage);
        string message = Normalize(rawMessage);
        if (CharacterCount(message) > 500) return Fail("multiTimedSelectedMessage must contain no more than 500 creator-authored plain-text characters.");
        Dictionary<string, string> platformMessages = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        string selectedMessagesJson;
        if (CPH.TryGetArg("multiTimedSelectedMessages", out selectedMessagesJson) && !String.IsNullOrWhiteSpace(selectedMessagesJson))
        {
            if (selectedMessagesJson.Length > MaximumPlatformMessageJsonLength) return Fail("multiTimedSelectedMessages exceeds the bounded input size.");
            try { platformMessages = ParsePlatformMessages(selectedMessagesJson); }
            catch (JsonException) { return Fail("multiTimedSelectedMessages is not a valid JSON object."); }
            catch (ArgumentException error) { return Fail(error.Message); }
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
                if (platformMessage.Length == 0 || CharacterCount(platformMessage) > maximum) throw new ArgumentException(platform + " message must contain 1-" + maximum + " characters.");
                Send(platform, platformMessage);
                dispatched.Add(platform);
            }
            catch (Exception error)
            {
                failed.Add(platform);
                CPH.LogError("THSV Timed Message Output could not dispatch to " + platform + " (" + error.GetType().Name + ").");
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

    private static Dictionary<string, string> ParsePlatformMessages(string input)
    {
        JObject source = JObject.Parse(input);
        if (source.Count > 4) throw new ArgumentException("multiTimedSelectedMessages may contain no more than four platforms.");
        Dictionary<string, string> result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (JProperty property in source.Properties())
        {
            string platform = property.Name.ToLowerInvariant();
            if (platform != "twitch" && platform != "youtube" && platform != "kick" && platform != "tiktok") throw new ArgumentException("multiTimedSelectedMessages contains an unsupported platform.");
            if (property.Value.Type != JTokenType.String) throw new ArgumentException("Each platform-specific timed message must be a string.");
            string message = Normalize(property.Value.ToString());
            int maximum = platform == "youtube" ? 200 : platform == "tiktok" ? 150 : 500;
            if (message.Length == 0 || CharacterCount(message) > maximum) throw new ArgumentException(platform + " message must contain 1-" + maximum + " characters.");
            result.Add(platform, message);
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

    private static int CharacterCount(string input)
    {
        int count = 0;
        for (int index = 0; index < input.Length; index++)
        {
            if (Char.IsHighSurrogate(input[index]) && index + 1 < input.Length && Char.IsLowSurrogate(input[index + 1])) index++;
            count++;
        }
        return count;
    }
}
