// Purpose: Retrieves one bounded page of the broadcaster's Twitch followers and returns it to Follower Pulse.
// Keep this action triggerless. Twitch credentials remain in Streamer.bot and are sent only to the fixed Helix followers endpoint.
// References: mscorlib.dll, System.dll, System.Core.dll, System.Net.Http.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Streamer.bot.Plugin.Interface.Model;

public class CPHInline
{
    private const string ModuleId = "thsv.follower-pulse";
    private const string PageEvent = "addon.thsv.follower-pulse.snapshot-page";
    private const string SourceName = "THSV Addon - Follower Pulse - Snapshot Page";
    private const string HelixUrl = "https://api.twitch.tv/helix/channels/followers";
    private const int MaximumResponseCharacters = 524288;
    private static readonly HttpClient Http = CreateClient();

    public bool Execute()
    {
        string scanId = Read("followerPulseScanId", 100);
        string cursor = Read("followerPulseCursor", 512);
        string relayToken = Read("thsvAddonRelayToken", 100);
        int page = ReadInteger("followerPulsePage", 0, 0, 100);
        int maximumTracked = ReadInteger("followerPulseMaximumTracked", 500, 25, 500);
        if (scanId.Length == 0 || relayToken.Length < 20) return Fail("A scan ID and one-use relay token are required.");

        try
        {
            string token = Bounded(CPH.TwitchOAuthToken, 4096);
            string clientId = Bounded(CPH.TwitchClientId, 256);
            TwitchUserInfo broadcaster = CPH.TwitchGetBroadcaster();
            if (String.IsNullOrWhiteSpace(token) || String.IsNullOrWhiteSpace(clientId) || broadcaster == null || String.IsNullOrWhiteSpace(broadcaster.UserId))
                return Fail("The Twitch broadcaster account is not authenticated in Streamer.bot.");

            string url = HelixUrl + "?broadcaster_id=" + Uri.EscapeDataString(broadcaster.UserId) + "&first=100";
            if (cursor.Length > 0) url += "&after=" + Uri.EscapeDataString(cursor);
            JObject root = GetJson(url, token, clientId);
            int total = BoundedInteger(root["total"], -1, 0, Int32.MaxValue);
            if (total < 0) return Fail("Twitch did not return a valid follower total.");

            var followers = new JArray();
            JArray data = root["data"] as JArray;
            if (total <= maximumTracked && data != null)
            {
                foreach (JToken item in data)
                {
                    string id = Bounded((string)item["user_id"], 32);
                    string login = Bounded((string)item["user_login"], 25).ToLowerInvariant();
                    string name = Bounded((string)item["user_name"], 25);
                    string followedAt = Bounded((string)item["followed_at"], 40);
                    if (!Digits(id) || !Login(login) || name.Length == 0 || !followedAt.Contains("T")) continue;
                    followers.Add(new JObject { ["id"] = id, ["login"] = login, ["name"] = name, ["followedAt"] = followedAt });
                }
            }
            string nextCursor = Bounded((string)root["pagination"]?["cursor"], 512);
            var payload = new JObject { ["scanId"] = scanId, ["page"] = page, ["total"] = total, ["nextCursor"] = nextCursor, ["followers"] = followers };
            var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId, ["eventType"] = PageEvent, ["sourceEventType"] = SourceName, ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = relayToken, ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = ReadBool("isTest"), ["payload"] = payload };
            CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
            CPH.SetArgument("followerPulseSnapshotValid", true);
            CPH.SetArgument("followerPulseSnapshotPage", page);
            CPH.SetArgument("followerPulseSnapshotTotal", total);
            CPH.SetArgument("followerPulseSnapshotReturned", followers.Count);
            return true;
        }
        catch (Exception exception)
        {
            CPH.LogError("THSV Follower Pulse snapshot failed (" + exception.GetType().Name + ").");
            return RelayFailure(scanId, page, relayToken, "Twitch follower retrieval failed. Confirm moderator:read:followers and reconnect the broadcaster account if needed.");
        }
    }

    private bool RelayFailure(string scanId, int page, string relayToken, string reason)
    {
        try
        {
            var payload = new JObject {
                ["scanId"] = scanId, ["page"] = page, ["total"] = 0, ["nextCursor"] = "",
                ["followers"] = new JArray(), ["error"] = Bounded(reason, 300)
            };
            var envelope = new JObject {
                ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId,
                ["eventType"] = PageEvent, ["sourceEventType"] = SourceName,
                ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = relayToken,
                ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = ReadBool("isTest"),
                ["payload"] = payload
            };
            CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
        }
        catch (Exception relayError)
        {
            CPH.LogWarn("THSV Follower Pulse could not relay its failure (" + relayError.GetType().Name + ").");
        }
        return Fail(reason);
    }

    private JObject GetJson(string url, string token, string clientId)
    {
        if (!url.StartsWith(HelixUrl + "?", StringComparison.Ordinal)) throw new InvalidOperationException("Unsafe Twitch follower URL.");
        using (var request = new HttpRequestMessage(HttpMethod.Get, url))
        using (var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10)))
        {
            request.Headers.Add("Client-ID", clientId);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using (HttpResponseMessage response = Http.SendAsync(request, HttpCompletionOption.ResponseContentRead, cancellation.Token).GetAwaiter().GetResult())
            {
                long? length = response.Content.Headers.ContentLength;
                if (length.HasValue && length.Value > MaximumResponseCharacters) throw new InvalidOperationException("Twitch response was too large.");
                string body = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                if (body.Length > MaximumResponseCharacters) throw new InvalidOperationException("Twitch response was too large.");
                if (response.StatusCode == (HttpStatusCode)429) throw new InvalidOperationException("Twitch rate limit reached.");
                if (!response.IsSuccessStatusCode) throw new HttpRequestException("Twitch returned HTTP " + ((int)response.StatusCode).ToString() + ".");
                return JObject.Parse(body);
            }
        }
    }

    private static HttpClient CreateClient() { var client = new HttpClient(); client.Timeout = TimeSpan.FromSeconds(12); return client; }
    private string Read(string key, int maximum) { object value; return Bounded(CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : "", maximum); }
    private bool ReadBool(string key) { bool value; return Boolean.TryParse(Read(key, 10), out value) && value; }
    private int ReadInteger(string key, int fallback, int minimum, int maximum) { int value; return Int32.TryParse(Read(key, 20), out value) ? Math.Min(maximum, Math.Max(minimum, value)) : fallback; }
    private int BoundedInteger(JToken value, int fallback, int minimum, int maximum) { int number; return value != null && Int32.TryParse(value.ToString(), out number) ? Math.Min(maximum, Math.Max(minimum, number)) : fallback; }
    private string Bounded(string value, int maximum) { value = value ?? ""; return value.Length <= maximum ? value : value.Substring(0, maximum); }
    private bool Digits(string value) { if (value.Length == 0) return false; foreach (char c in value) if (c < '0' || c > '9') return false; return true; }
    private bool Login(string value) { if (value.Length == 0 || value.Length > 25) return false; foreach (char c in value) if (!(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9') && c != '_') return false; return true; }
    private bool Fail(string reason) { CPH.SetArgument("followerPulseSnapshotValid", false); CPH.SetArgument("followerPulseSnapshotError", reason); CPH.LogWarn("THSV Follower Pulse: " + reason); return false; }
}
