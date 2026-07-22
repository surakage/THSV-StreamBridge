// Purpose: Sends one creator-requested public chat segment to MyMemory's documented no-key API,
// then returns only the bounded result to the User Translate add-on through its authenticated relay.
// Privacy: The source text leaves the local computer. It is never logged or stored by this action.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.user-translate";
    private const int MaximumInputCharacters = 1500;
    private const int MaximumOutputCharacters = 4000;
    private const int MaximumSegmentBytes = 450;
    private const int MaximumSegments = 4;
    private const int MaximumProviderResponseCharacters = 262144;
    private static readonly Regex LanguagePattern = new Regex("^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public bool Execute()
    {
        string relayToken = ReadArgument("thsvAddonRelayToken", 256);
        string requestId = ReadArgument("requestId", 100);
        string text = Normalize(ReadArgument("text", MaximumInputCharacters));
        string sourceLanguage = ReadArgument("sourceLanguage", 20).ToLowerInvariant();
        string targetLanguage = ReadArgument("targetLanguage", 20).ToLowerInvariant();
        int timeoutSeconds = ReadInteger("timeoutSeconds", 8, 3, 15);
        if (String.IsNullOrWhiteSpace(relayToken)) return Fail("StreamBridge did not dispatch this translation action.");
        if (String.IsNullOrWhiteSpace(requestId) || String.IsNullOrWhiteSpace(text)) return Fail("A request ID and text are required.");
        if (!LanguagePattern.IsMatch(sourceLanguage) || !LanguagePattern.IsMatch(targetLanguage) || sourceLanguage == targetLanguage) return Fail("The language pair is invalid.");

        bool succeeded = false;
        string translatedText = "";
        string errorCode = "provider-unavailable";
        try
        {
            var translatedSegments = new List<string>();
            foreach (string segment in SplitUtf8(text))
            {
                translatedSegments.Add(TranslateSegment(segment, sourceLanguage, targetLanguage, timeoutSeconds));
            }
            translatedText = Bounded(Normalize(String.Join(" ", translatedSegments.ToArray())), MaximumOutputCharacters);
            succeeded = !String.IsNullOrWhiteSpace(translatedText);
            errorCode = succeeded ? "" : "empty-response";
        }
        catch (WebException) { errorCode = "network-or-timeout"; }
        catch (InvalidDataException) { errorCode = "invalid-provider-response"; }
        catch (Exception exception)
        {
            errorCode = "unexpected-provider-error";
            CPH.LogWarn("THSV User Translate provider failed (" + exception.GetType().Name + ").");
        }

        string relayId = Guid.NewGuid().ToString("N");
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.user-translate.translation-received",
            ["sourceEventType"] = "THSV Addon - User Translate - Translate Text",
            ["relayId"] = relayId, ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false,
            ["payload"] = new JObject
            {
                ["requestId"] = requestId, ["succeeded"] = succeeded,
                ["translatedText"] = translatedText, ["errorCode"] = errorCode,
            },
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception exception) { return Fail("Relaying the translation result failed (" + exception.GetType().Name + ")."); }

        CPH.SetArgument("userTranslateValid", succeeded);
        CPH.SetArgument("userTranslateRequestId", requestId);
        CPH.SetArgument("userTranslateErrorCode", errorCode);
        return succeeded;
    }

    private string TranslateSegment(string text, string sourceLanguage, string targetLanguage, int timeoutSeconds)
    {
        string url = "https://api.mymemory.translated.net/get?q=" + Uri.EscapeDataString(text) + "&langpair=" + Uri.EscapeDataString(sourceLanguage + "|" + targetLanguage) + "&mt=1";
        var request = (HttpWebRequest)WebRequest.Create(url);
        request.Method = "GET";
        request.Accept = "application/json";
        request.UserAgent = "THSV-StreamBridge-User-Translate/1.0";
        request.Timeout = timeoutSeconds * 1000;
        request.ReadWriteTimeout = timeoutSeconds * 1000;
        using (var response = (HttpWebResponse)request.GetResponse())
        using (var stream = response.GetResponseStream())
        using (var reader = new StreamReader(stream, Encoding.UTF8, true, 1024, false))
        {
            if (response.StatusCode != HttpStatusCode.OK) throw new WebException("Translation provider returned an HTTP error.");
            // Bound third-party data before JSON parsing so a bad provider response cannot grow memory without limit.
            var root = JObject.Parse(ReadBoundedProviderResponse(reader));
            int status = root.Value<int?>("responseStatus") ?? 0;
            string translated = root["responseData"] == null ? "" : (string)root["responseData"]["translatedText"];
            if (status != 200 || String.IsNullOrWhiteSpace(translated)) throw new InvalidDataException("Translation provider returned no usable translation.");
            return WebUtility.HtmlDecode(translated);
        }
    }

    private string ReadBoundedProviderResponse(TextReader reader)
    {
        var result = new StringBuilder();
        var buffer = new char[4096];
        int read;
        while ((read = reader.Read(buffer, 0, buffer.Length)) > 0)
        {
            if (result.Length + read > MaximumProviderResponseCharacters) throw new InvalidDataException("Translation provider response exceeded the safety limit.");
            result.Append(buffer, 0, read);
        }
        return result.ToString();
    }

    private IEnumerable<string> SplitUtf8(string value)
    {
        var segments = new List<string>();
        var current = new StringBuilder();
        foreach (string word in value.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries))
        {
            string candidate = current.Length == 0 ? word : current.ToString() + " " + word;
            if (Encoding.UTF8.GetByteCount(candidate) <= MaximumSegmentBytes) { current.Clear(); current.Append(candidate); continue; }
            if (current.Length > 0) { segments.Add(current.ToString()); current.Clear(); }
            foreach (char character in word)
            {
                string next = current.ToString() + character;
                if (Encoding.UTF8.GetByteCount(next) > MaximumSegmentBytes && current.Length > 0)
                {
                    segments.Add(current.ToString()); current.Clear();
                    if (segments.Count >= MaximumSegments) break;
                }
                current.Append(character);
            }
            if (segments.Count >= MaximumSegments) break;
        }
        if (current.Length > 0 && segments.Count < MaximumSegments) segments.Add(current.ToString());
        if (segments.Count == 0) throw new InvalidDataException("No translatable segment was produced.");
        return segments;
    }

    private string ReadArgument(string name, int maximumLength)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? Bounded(Convert.ToString(value) ?? "", maximumLength) : "";
    }
    private int ReadInteger(string name, int fallback, int minimum, int maximum)
    {
        int parsed;
        return Int32.TryParse(ReadArgument(name, 20), out parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
    }
    private string Normalize(string value) { return Regex.Replace(value ?? "", "[\\x00-\\x1F\\x7F\\s]+", " ").Trim(); }
    private string Bounded(string value, int maximumLength) { return String.IsNullOrEmpty(value) || value.Length <= maximumLength ? value ?? "" : value.Substring(0, maximumLength); }
    private bool Fail(string reason)
    {
        CPH.SetArgument("userTranslateValid", false); CPH.SetArgument("userTranslateErrorCode", "invalid-request");
        CPH.LogWarn("THSV User Translate: " + reason); return false;
    }
}
