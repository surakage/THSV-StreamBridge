// Purpose: Fetches one bounded fact or joke for Village Fun Commands and relays it
// through StreamBridge's authenticated one-use add-on envelope.
// Privacy: No viewer identity, username, or chat history is sent to a provider.
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
    private const string ModuleId = "thsv.village-fun-commands";
    private const int MaximumResponseCharacters = 65536;

    public bool Execute()
    {
        string relayToken = ReadArgument("thsvAddonRelayToken", 256);
        string requestId = ReadArgument("villageFunRequestId", 100);
        string provider = ReadArgument("villageFunProvider", 20).ToLowerInvariant();
        string number = ReadArgument("villageFunNumber", 20).ToLowerInvariant();
        if (String.IsNullOrWhiteSpace(relayToken)) return Fail("StreamBridge did not dispatch this action.");
        if (String.IsNullOrWhiteSpace(requestId)) return Fail("A request ID is required.");
        if (!Regex.IsMatch(provider, "^(cat|joke|fun|number|chuck)$")) return Fail("The provider is not approved.");
        if (number != "random" && !Regex.IsMatch(number, "^[0-9]{1,7}$")) return Fail("The requested number is invalid.");

        bool succeeded = false;
        string content = "";
        string errorCode = "provider-unavailable";
        try
        {
            string url;
            string property;
            if (provider == "cat") { url = "https://catfact.ninja/fact"; property = "fact"; }
            else if (provider == "joke") { url = "https://v2.jokeapi.dev/joke/Programming,Miscellaneous,Pun?safe-mode&blacklistFlags=nsfw,religious,political,racist,sexist,explicit&type=single"; property = "joke"; }
            else if (provider == "fun") { url = "https://uselessfacts.jsph.pl/api/v2/facts/random?language=en"; property = "text"; }
            else if (provider == "number") { url = "https://numbersapi.com/" + Uri.EscapeDataString(number) + "/trivia?json"; property = "text"; }
            else { url = "https://api.chucknorris.io/jokes/random"; property = "value"; }
            JObject root = RequestJson(url);
            content = Clean(root.Value<string>(property), 350);
            succeeded = !String.IsNullOrWhiteSpace(content) && !Regex.IsMatch(content, "https?://|[<>]", RegexOptions.IgnoreCase);
            errorCode = succeeded ? "" : "unsafe-or-empty-response";
        }
        catch (WebException) { errorCode = "network-or-timeout"; }
        catch (InvalidDataException) { errorCode = "invalid-provider-response"; }
        catch (JsonException) { errorCode = "invalid-provider-response"; }
        catch (Exception exception)
        {
            errorCode = "unexpected-provider-error";
            CPH.LogWarn("THSV Village Fun provider fetch failed (" + exception.GetType().Name + ").");
        }

        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.village-fun-commands.content-received",
            ["sourceEventType"] = "THSV Addon - Village Fun Commands - Fetch Fun Content",
            ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false,
            ["payload"] = new JObject { ["requestId"] = requestId, ["provider"] = provider, ["succeeded"] = succeeded, ["content"] = content, ["errorCode"] = errorCode }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception exception) { return Fail("Relaying the provider response failed (" + exception.GetType().Name + ")."); }
        CPH.SetArgument("villageFunFetchValid", succeeded);
        CPH.SetArgument("villageFunFetchProvider", provider);
        CPH.SetArgument("villageFunFetchError", errorCode);
        return succeeded;
    }

    private JObject RequestJson(string url)
    {
        var request = (HttpWebRequest)WebRequest.Create(url);
        request.Method = "GET";
        request.Accept = "application/json";
        request.UserAgent = "THSV-StreamBridge-Village-Fun/4.0.7";
        request.Timeout = 3000;
        request.ReadWriteTimeout = 3000;
        request.AllowAutoRedirect = false;
        using (var response = (HttpWebResponse)request.GetResponse())
        using (var stream = response.GetResponseStream())
        using (var reader = new StreamReader(stream, Encoding.UTF8, true, 1024, false))
        {
            if (response.StatusCode != HttpStatusCode.OK) throw new WebException("The provider returned an HTTP error.");
            var builder = new StringBuilder();
            var buffer = new char[2048];
            int read;
            while ((read = reader.Read(buffer, 0, buffer.Length)) > 0)
            {
                if (builder.Length + read > MaximumResponseCharacters) throw new InvalidDataException("The provider response exceeded the safety limit.");
                builder.Append(buffer, 0, read);
            }
            return JObject.Parse(builder.ToString());
        }
    }

    private string Clean(string value, int maximumLength)
    {
        string result = WebUtility.HtmlDecode(value ?? "");
        result = Regex.Replace(result, "[\\x00-\\x1F\\x7F\\s]+", " ").Trim();
        return result.Length <= maximumLength ? result : result.Substring(0, maximumLength);
    }
    private string ReadArgument(string name, int maximumLength)
    {
        object value;
        string result = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value) ?? "" : "";
        return result.Length <= maximumLength ? result : result.Substring(0, maximumLength);
    }
    private bool Fail(string reason)
    {
        CPH.SetArgument("villageFunFetchValid", false);
        CPH.SetArgument("villageFunFetchError", "invalid-request");
        CPH.LogWarn("THSV Village Fun Commands: " + reason);
        return false;
    }
}
