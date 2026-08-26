// Purpose: Fetches a bounded random English word batch, verifies every word through
// a public dictionary, and returns short definitions as Unscramble hints.
// Privacy: Only batch size and word-length settings are sent; no viewer or chat data leaves the machine.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.chat-play-pack";
    private const int MaximumResponseCharacters = 262144;
    private const int OverallTimeoutSeconds = 15;

    public bool Execute()
    {
        string relayToken = ReadArgument("thsvAddonRelayToken", 256);
        string requestId = ReadArgument("requestId", 100);
        int amount = ReadInteger("amount", 5, 3, 10);
        int minimumLength = ReadInteger("minimumLength", 5, 4, 12);
        int maximumLength = ReadInteger("maximumLength", 9, 4, 14);
        if (String.IsNullOrWhiteSpace(relayToken)) return Fail("StreamBridge did not dispatch this dictionary action.");
        if (String.IsNullOrWhiteSpace(requestId)) return Fail("A request ID is required.");
        if (minimumLength > maximumLength) { int swap = minimumLength; minimumLength = maximumLength; maximumLength = swap; }

        bool succeeded = false;
        string errorCode = "provider-unavailable";
        var words = new JArray();
        var seen = new System.Collections.Generic.HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var clock = Stopwatch.StartNew();
        try
        {
            int length = RandomNumber(minimumLength, maximumLength + 1);
            int candidateCount = Math.Min(20, amount * 2);
            string randomUrl = "https://random-word-api.herokuapp.com/word?number=" + candidateCount.ToString() + "&length=" + length.ToString() + "&lang=en";
            JArray candidates = RequestArray(randomUrl, 5);
            foreach (JToken candidate in candidates)
            {
                if (words.Count >= amount || clock.Elapsed.TotalSeconds >= OverallTimeoutSeconds) break;
                string word = Clean(Convert.ToString(candidate), 32).ToLowerInvariant();
                if (!Regex.IsMatch(word, "^[a-z]{4,14}$") || !seen.Add(word)) continue;
                try
                {
                    JArray entries = RequestArray("https://api.dictionaryapi.dev/api/v2/entries/en/" + Uri.EscapeDataString(word), 3);
                    string definition = FirstDefinition(entries);
                    if (String.IsNullOrWhiteSpace(definition)) continue;
                    words.Add(new JObject { ["word"] = word, ["hint"] = definition });
                }
                catch (WebException) { /* A candidate without a dictionary entry is safely skipped. */ }
                catch (InvalidDataException) { /* A malformed candidate response is safely skipped. */ }
            }
            succeeded = words.Count > 0;
            errorCode = succeeded ? "" : clock.Elapsed.TotalSeconds >= OverallTimeoutSeconds ? "provider-timeout" : "empty-response";
        }
        catch (WebException) { errorCode = "network-or-timeout"; }
        catch (InvalidDataException) { errorCode = "invalid-provider-response"; }
        catch (Exception exception) { errorCode = "unexpected-provider-error"; CPH.LogWarn("THSV Chat Play dictionary fetch failed (" + exception.GetType().Name + ")."); }

        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.chat-play-pack.unscramble-received",
            ["sourceEventType"] = "THSV Addon - Chat Play Pack - Fetch Unscramble Words",
            ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false,
            ["payload"] = new JObject { ["requestId"] = requestId, ["succeeded"] = succeeded, ["words"] = words, ["errorCode"] = errorCode }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception exception) { return Fail("Relaying the dictionary result failed (" + exception.GetType().Name + ")."); }
        CPH.SetArgument("chatPlayUnscrambleValid", succeeded); CPH.SetArgument("chatPlayUnscrambleCount", words.Count); CPH.SetArgument("chatPlayUnscrambleError", errorCode);
        return succeeded;
    }

    private JArray RequestArray(string url, int timeoutSeconds)
    {
        var request = (HttpWebRequest)WebRequest.Create(url); request.Method = "GET"; request.Accept = "application/json";
        request.UserAgent = "THSV-StreamBridge-Chat-Play/4.0.7"; request.Timeout = timeoutSeconds * 1000; request.ReadWriteTimeout = timeoutSeconds * 1000;
        using (var response = (HttpWebResponse)request.GetResponse())
        using (var stream = response.GetResponseStream())
        using (var reader = new StreamReader(stream, Encoding.UTF8, true, 1024, false))
        {
            if (response.StatusCode != HttpStatusCode.OK) throw new WebException("The word provider returned an HTTP error.");
            var builder = new StringBuilder(); var buffer = new char[4096]; int read;
            while ((read = reader.Read(buffer, 0, buffer.Length)) > 0) { if (builder.Length + read > MaximumResponseCharacters) throw new InvalidDataException("The word-provider response exceeded the safety limit."); builder.Append(buffer, 0, read); }
            return JArray.Parse(builder.ToString());
        }
    }

    private string FirstDefinition(JArray entries)
    {
        foreach (JToken entry in entries)
        {
            var meanings = entry["meanings"] as JArray; if (meanings == null) continue;
            foreach (JToken meaning in meanings)
            {
                var definitions = meaning["definitions"] as JArray; if (definitions == null) continue;
                foreach (JToken definition in definitions)
                {
                    string value = Clean(definition.Value<string>("definition"), 160);
                    if (!String.IsNullOrWhiteSpace(value)) return value;
                }
            }
        }
        return "";
    }

    private int RandomNumber(int minimum, int maximumExclusive)
    {
        if (maximumExclusive <= minimum) return minimum;
        using (var generator = System.Security.Cryptography.RandomNumberGenerator.Create())
        {
            var bytes = new byte[4]; generator.GetBytes(bytes); uint value = BitConverter.ToUInt32(bytes, 0);
            return minimum + (int)(value % (uint)(maximumExclusive - minimum));
        }
    }

    private string Clean(string value, int maximumLength) { string result = Regex.Replace(value ?? "", "[\\x00-\\x1F\\x7F\\s]+", " ").Trim(); return result.Length <= maximumLength ? result : result.Substring(0, maximumLength); }
    private string ReadArgument(string name, int maximumLength) { object value; string result = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value) ?? "" : ""; return result.Length <= maximumLength ? result : result.Substring(0, maximumLength); }
    private int ReadInteger(string name, int fallback, int minimum, int maximum) { int parsed; return Int32.TryParse(ReadArgument(name, 20), out parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback; }
    private bool Fail(string reason) { CPH.SetArgument("chatPlayUnscrambleValid", false); CPH.SetArgument("chatPlayUnscrambleError", "invalid-request"); CPH.LogWarn("THSV Chat Play: " + reason); return false; }
}
