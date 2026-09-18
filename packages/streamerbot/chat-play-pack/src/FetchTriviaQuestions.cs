// Purpose: Fetches one bounded batch of public OpenTDB questions for Chat Play Pack and
// returns it through StreamBridge's authenticated, one-use add-on relay.
// Privacy: No viewer identity, chat message, or point balance is sent to OpenTDB.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
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

    public bool Execute()
    {
        string relayToken = ReadArgument("thsvAddonRelayToken", 256);
        string requestId = ReadArgument("requestId", 100);
        int amount = ReadInteger("amount", 10, 5, 20);
        string category = ReadArgument("category", 3).ToLowerInvariant();
        string difficulty = ReadArgument("difficulty", 10).ToLowerInvariant();
        string questionType = ReadArgument("questionType", 10).ToLowerInvariant();
        if (String.IsNullOrWhiteSpace(relayToken)) return Fail("StreamBridge did not dispatch this trivia action.");
        if (String.IsNullOrWhiteSpace(requestId)) return Fail("A request ID is required.");
        if (category != "any" && !Regex.IsMatch(category, "^[0-9]{1,2}$")) return Fail("The category is invalid.");
        if (difficulty != "any" && difficulty != "easy" && difficulty != "medium" && difficulty != "hard") return Fail("The difficulty is invalid.");
        if (questionType != "any" && questionType != "multiple" && questionType != "boolean") return Fail("The question type is invalid.");

        bool succeeded = false;
        string errorCode = "provider-unavailable";
        var questions = new JArray();
        try
        {
            string url = "https://opentdb.com/api.php?amount=" + amount.ToString() + "&encode=url3986";
            if (category != "any") url += "&category=" + Uri.EscapeDataString(category);
            if (difficulty != "any") url += "&difficulty=" + Uri.EscapeDataString(difficulty);
            if (questionType != "any") url += "&type=" + Uri.EscapeDataString(questionType);
            JObject root = RequestJson(url, 10);
            int responseCode = root.Value<int?>("response_code") ?? -1;
            var results = root["results"] as JArray;
            if (responseCode != 0 || results == null || results.Count == 0) errorCode = "provider-response-" + responseCode.ToString();
            else
            {
                foreach (JToken result in results)
                {
                    string question = Decode(result.Value<string>("question"), 240);
                    string answer = Decode(result.Value<string>("correct_answer"), 180);
                    if (String.IsNullOrWhiteSpace(question) || String.IsNullOrWhiteSpace(answer)) continue;
                    var answers = new JArray { answer };
                    var choices = new JArray { answer };
                    var incorrect = result["incorrect_answers"] as JArray;
                    if (incorrect != null) foreach (JToken item in incorrect) { string value = Decode(Convert.ToString(item), 180); if (!String.IsNullOrWhiteSpace(value)) choices.Add(value); }
                    questions.Add(new JObject { ["question"] = question, ["answers"] = answers, ["choices"] = choices, ["category"] = Decode(result.Value<string>("category"), 80), ["difficulty"] = Decode(result.Value<string>("difficulty"), 20) });
                    if (questions.Count >= 20) break;
                }
                succeeded = questions.Count > 0;
                errorCode = succeeded ? "" : "empty-response";
            }
        }
        catch (WebException) { errorCode = "network-or-timeout"; }
        catch (InvalidDataException) { errorCode = "invalid-provider-response"; }
        catch (Exception exception) { errorCode = "unexpected-provider-error"; CPH.LogWarn("THSV Chat Play OpenTDB fetch failed (" + exception.GetType().Name + ")."); }

        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.chat-play-pack.trivia-received",
            ["sourceEventType"] = "THSV Addon - Chat Play Pack - Fetch Trivia Questions",
            ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false,
            ["payload"] = new JObject { ["requestId"] = requestId, ["succeeded"] = succeeded, ["questions"] = questions, ["errorCode"] = errorCode }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception exception) { return Fail("Relaying the trivia result failed (" + exception.GetType().Name + ")."); }
        CPH.SetArgument("chatPlayTriviaValid", succeeded); CPH.SetArgument("chatPlayTriviaCount", questions.Count); CPH.SetArgument("chatPlayTriviaError", errorCode);
        return succeeded;
    }

    private JObject RequestJson(string url, int timeoutSeconds)
    {
        var request = (HttpWebRequest)WebRequest.Create(url); request.Method = "GET"; request.Accept = "application/json";
        request.UserAgent = "THSV-StreamBridge-Chat-Play/4.0.10"; request.Timeout = timeoutSeconds * 1000; request.ReadWriteTimeout = timeoutSeconds * 1000;
        using (var response = (HttpWebResponse)request.GetResponse())
        using (var stream = response.GetResponseStream())
        using (var reader = new StreamReader(stream, Encoding.UTF8, true, 1024, false))
        {
            if (response.StatusCode != HttpStatusCode.OK) throw new WebException("OpenTDB returned an HTTP error.");
            var builder = new StringBuilder(); var buffer = new char[4096]; int read;
            while ((read = reader.Read(buffer, 0, buffer.Length)) > 0) { if (builder.Length + read > MaximumResponseCharacters) throw new InvalidDataException("OpenTDB response exceeded the safety limit."); builder.Append(buffer, 0, read); }
            return JObject.Parse(builder.ToString());
        }
    }

    private string Decode(string value, int maximumLength)
    {
        string decoded; try { decoded = Uri.UnescapeDataString(value ?? ""); } catch { decoded = value ?? ""; }
        decoded = WebUtility.HtmlDecode(decoded); decoded = Regex.Replace(decoded, "[\\x00-\\x1F\\x7F\\s]+", " ").Trim();
        return decoded.Length <= maximumLength ? decoded : decoded.Substring(0, maximumLength);
    }
    private string ReadArgument(string name, int maximumLength) { object value; string result = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value) ?? "" : ""; return result.Length <= maximumLength ? result : result.Substring(0, maximumLength); }
    private int ReadInteger(string name, int fallback, int minimum, int maximum) { int parsed; return Int32.TryParse(ReadArgument(name, 20), out parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback; }
    private bool Fail(string reason) { CPH.SetArgument("chatPlayTriviaValid", false); CPH.SetArgument("chatPlayTriviaError", "invalid-request"); CPH.LogWarn("THSV Chat Play: " + reason); return false; }
}
