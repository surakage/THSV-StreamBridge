// Purpose: Performs bounded Twitch raid discovery or starts one creator-confirmed raid for Raid Scout.
// Keep this action triggerless. The wizard grants its stable ID only to the Raid Scout add-on.
// Twitch credentials stay inside this action and are used only with fixed api.twitch.tv Helix endpoints.
// References: mscorlib.dll, System.dll, System.Core.dll, System.Net.Http.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Streamer.bot.Plugin.Interface.Model;

public class CPHInline
{
    private const string ModuleId = "thsv.raid-scout";
    private const string ResultEvent = "addon.thsv.raid-scout.controller-result";
    private const string SourceName = "THSV Addon - Raid Scout - Controller";
    private const string HelixRoot = "https://api.twitch.tv/helix/";
    private const int MaximumResponseCharacters = 262144;
    private const int MaximumCandidates = 40;
    private static readonly HttpClient Http = CreateClient();

    public bool Execute()
    {
        string operation = Read("raidScoutOperation").ToLowerInvariant();
        string requestId = Bounded(Read("raidScoutRequestId"), 100);
        string relayToken = Bounded(Read("thsvAddonRelayToken"), 100);
        if (requestId.Length == 0 || relayToken.Length < 20)
            return Fail(operation, requestId, relayToken, "A bounded request ID and one-use relay token are required.");

        try
        {
            if (operation == "discover") return Discover(requestId, relayToken);
            if (operation == "raid") return StartRaid(requestId, relayToken);
            return Fail(operation, requestId, relayToken, "Unsupported Raid Scout operation.");
        }
        catch (Exception exception)
        {
            CPH.LogError("THSV Raid Scout controller failed (" + exception.GetType().Name + ").");
            Emit(operation, requestId, relayToken, false, "Streamer.bot could not complete the Raid Scout operation.", new JObject());
            return false;
        }
    }

    private bool Discover(string requestId, string relayToken)
    {
        string token = Bounded(CPH.TwitchOAuthToken, 4096);
        string clientId = Bounded(CPH.TwitchClientId, 256);
        TwitchUserInfo broadcaster = CPH.TwitchGetBroadcaster();
        if (String.IsNullOrWhiteSpace(token) || String.IsNullOrWhiteSpace(clientId) || broadcaster == null
            || String.IsNullOrWhiteSpace(broadcaster.UserId) || String.IsNullOrWhiteSpace(broadcaster.UserLogin))
            return Fail("discover", requestId, relayToken, "The Twitch broadcaster account is not authenticated in Streamer.bot.");

        bool usePreferred = ReadBoolean("raidScoutUsePreferred", true);
        bool useFollowed = ReadBoolean("raidScoutUseFollowed", true);
        bool useCategory = ReadBoolean("raidScoutUseCategory", true);
        int followedLimit = ReadInteger("raidScoutMaximumFollowedResults", 25, 1, MaximumCandidates);
        int followedPages = ReadInteger("raidScoutMaximumFollowedPages", 2, 1, 3);
        int categoryLimit = ReadInteger("raidScoutMaximumCategoryResults", 25, 1, MaximumCandidates);
        int fallbackAudience = ReadInteger("raidScoutCurrentAudienceEstimate", 0, 0, 10000000);
        List<string> preferred = ParseLogins(Read("raidScoutPreferredChannels"), 25);
        List<string> sourceOrder = ParseSourceOrder(Read("raidScoutSourceOrder"));
        var candidates = new List<JObject>();
        var seenIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var sourceErrors = new JArray();

        int currentAudience = fallbackAudience;
        string currentCategory = "";
        string currentGameId = "";
        try
        {
            JObject ownStream = FirstStream(GetJson("streams?user_id=" + Uri.EscapeDataString(broadcaster.UserId), token, clientId));
            if (ownStream != null)
            {
                currentAudience = BoundedInteger(ownStream["viewer_count"], fallbackAudience, 0, 10000000);
                currentCategory = Bounded((string)ownStream["game_name"], 140);
                currentGameId = Bounded((string)ownStream["game_id"], 64);
            }
        }
        catch (Exception exception)
        {
            sourceErrors.Add("Broadcaster status unavailable (" + exception.GetType().Name + ").");
        }
        if (currentGameId.Length == 0)
        {
            try
            {
                TwitchUserInfoEx extended = CPH.TwitchGetExtendedUserInfoById(broadcaster.UserId);
                if (extended != null)
                {
                    currentGameId = Bounded(extended.GameId, 64);
                    currentCategory = Bounded(extended.Game, 140);
                }
            }
            catch (Exception exception)
            {
                sourceErrors.Add("Broadcaster category unavailable (" + exception.GetType().Name + ").");
            }
        }

        foreach (string source in sourceOrder)
        {
            if (source == "preferred" && usePreferred && preferred.Count > 0)
            {
                DiscoverPreferred(preferred, token, clientId, candidates, seenIds, sourceErrors);
            }
            else if (source == "followed" && useFollowed)
            {
                DiscoverFollowed(broadcaster.UserId, followedLimit, followedPages, token, clientId, candidates, seenIds, sourceErrors);
            }
            else if (source == "category" && useCategory && currentGameId.Length > 0)
            {
                DiscoverCategory(currentGameId, categoryLimit, token, clientId, candidates, seenIds, sourceErrors);
            }
            if (candidates.Count >= MaximumCandidates) break;
        }

        AddProfileImages(candidates, token, clientId, sourceErrors);
        var payload = new JObject
        {
            ["broadcasterUserId"] = Bounded(broadcaster.UserId, 64),
            ["broadcasterLogin"] = Bounded(broadcaster.UserLogin, 25),
            ["currentAudience"] = currentAudience,
            ["currentCategory"] = currentCategory,
            ["candidates"] = new JArray(candidates),
            ["sourceErrors"] = sourceErrors
        };
        Emit("discover", requestId, relayToken, true, "", payload);
        CPH.SetArgument("raidScoutDiscoveryValid", true);
        CPH.SetArgument("raidScoutCandidateCount", candidates.Count);
        CPH.LogInfo("THSV Raid Scout returned " + candidates.Count.ToString() + " bounded live candidate(s).");
        return true;
    }

    private bool StartRaid(string requestId, string relayToken)
    {
        string login = Read("raidScoutTargetLogin").TrimStart('@').ToLowerInvariant();
        string userId = Bounded(Read("raidScoutTargetUserId"), 64);
        if (!IsLogin(login)) return Fail("raid", requestId, relayToken, "A valid Twitch target login is required.");
        bool accepted = userId.Length > 0 ? CPH.TwitchStartRaidById(userId) : CPH.TwitchStartRaidByName(login);
        var payload = new JObject { ["targetLogin"] = login, ["targetUserId"] = userId };
        Emit("raid", requestId, relayToken, accepted, accepted ? "" : "Twitch did not accept the raid request.", payload);
        CPH.SetArgument("raidScoutRaidAccepted", accepted);
        CPH.SetArgument("raidScoutRaidTarget", login);
        if (accepted) CPH.LogInfo("THSV Raid Scout started one creator-confirmed Twitch raid.");
        else CPH.LogWarn("THSV Raid Scout could not start the creator-confirmed Twitch raid.");
        return accepted;
    }

    private void DiscoverPreferred(List<string> preferred, string token, string clientId, List<JObject> candidates, HashSet<string> seenIds, JArray sourceErrors)
    {
        try
        {
            string query = "streams?first=" + preferred.Count.ToString();
            foreach (string login in preferred) query += "&user_login=" + Uri.EscapeDataString(login);
            AddStreams(GetJson(query, token, clientId), "preferred", MaximumCandidates, candidates, seenIds);
        }
        catch (Exception exception)
        {
            sourceErrors.Add("Preferred-channel search failed (" + exception.GetType().Name + ").");
        }
    }

    private void DiscoverFollowed(string broadcasterId, int limit, int pages, string token, string clientId, List<JObject> candidates, HashSet<string> seenIds, JArray sourceErrors)
    {
        try
        {
            string cursor = "";
            for (int page = 0; page < pages && candidates.Count < MaximumCandidates && CountSource(candidates, "followed") < limit; page++)
            {
                int remaining = Math.Min(20, limit - CountSource(candidates, "followed"));
                if (remaining <= 0) break;
                string query = "streams/followed?user_id=" + Uri.EscapeDataString(broadcasterId) + "&first=" + remaining.ToString();
                if (cursor.Length > 0) query += "&after=" + Uri.EscapeDataString(cursor);
                JObject root = GetJson(query, token, clientId);
                AddStreams(root, "followed", limit, candidates, seenIds);
                cursor = Bounded((string)root["pagination"]?["cursor"], 512);
                if (cursor.Length == 0) break;
            }
        }
        catch (Exception exception)
        {
            sourceErrors.Add("Followed-live search failed. Confirm user:read:follows is available (" + exception.GetType().Name + ").");
        }
    }

    private void DiscoverCategory(string gameId, int limit, string token, string clientId, List<JObject> candidates, HashSet<string> seenIds, JArray sourceErrors)
    {
        try
        {
            JObject root = GetJson("streams?game_id=" + Uri.EscapeDataString(gameId) + "&first=" + limit.ToString(), token, clientId);
            AddStreams(root, "category", limit, candidates, seenIds);
        }
        catch (Exception exception)
        {
            sourceErrors.Add("Same-category search failed (" + exception.GetType().Name + ").");
        }
    }

    private JObject GetJson(string relativePath, string token, string clientId)
    {
        if (String.IsNullOrWhiteSpace(relativePath) || relativePath.Contains("://") || relativePath.Contains(".."))
            throw new InvalidOperationException("Unsafe Twitch request path.");
        using (var request = new HttpRequestMessage(HttpMethod.Get, HelixRoot + relativePath))
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

    private void AddStreams(JObject root, string source, int sourceLimit, List<JObject> output, HashSet<string> seenIds)
    {
        JArray data = root["data"] as JArray;
        if (data == null) return;
        int existing = CountSource(output, source);
        foreach (JToken item in data)
        {
            if (output.Count >= MaximumCandidates || existing >= sourceLimit) break;
            string userId = Bounded((string)item["user_id"], 64);
            string login = Bounded((string)item["user_login"], 25).ToLowerInvariant();
            string displayName = Bounded((string)item["user_name"], 100);
            if (userId.Length == 0 || !IsLogin(login) || displayName.Length == 0 || seenIds.Contains(userId)) continue;
            var tags = new JArray();
            JArray sourceTags = item["tags"] as JArray;
            if (sourceTags != null)
            {
                foreach (JToken tag in sourceTags)
                {
                    if (tags.Count >= 20) break;
                    string boundedTag = Bounded((string)tag, 100);
                    if (boundedTag.Length > 0) tags.Add(boundedTag);
                }
            }
            string thumbnail = Bounded((string)item["thumbnail_url"], 2048).Replace("{width}", "640").Replace("{height}", "360");
            output.Add(new JObject
            {
                ["userId"] = userId,
                ["login"] = login,
                ["displayName"] = displayName,
                ["source"] = source,
                ["category"] = Bounded((string)item["game_name"], 140),
                ["title"] = Bounded((string)item["title"], 300),
                ["viewerCount"] = BoundedInteger(item["viewer_count"], 0, 0, 10000000),
                ["startedAt"] = Bounded((string)item["started_at"], 40),
                ["language"] = Bounded((string)item["language"], 12).ToLowerInvariant(),
                ["tags"] = tags,
                ["thumbnailUrl"] = thumbnail,
                ["profileImageUrl"] = ""
            });
            seenIds.Add(userId);
            existing++;
        }
    }

    private void AddProfileImages(List<JObject> candidates, string token, string clientId, JArray sourceErrors)
    {
        if (candidates.Count == 0) return;
        try
        {
            string query = "users?";
            for (int index = 0; index < candidates.Count; index++)
                query += (index == 0 ? "" : "&") + "id=" + Uri.EscapeDataString((string)candidates[index]["userId"]);
            JObject root = GetJson(query, token, clientId);
            var images = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            JArray data = root["data"] as JArray;
            if (data != null)
            {
                foreach (JToken user in data)
                {
                    string id = Bounded((string)user["id"], 64);
                    string image = Bounded((string)user["profile_image_url"], 2048);
                    if (id.Length > 0 && image.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) images[id] = image;
                }
            }
            foreach (JObject candidate in candidates)
            {
                string image;
                if (images.TryGetValue((string)candidate["userId"], out image)) candidate["profileImageUrl"] = image;
            }
        }
        catch (Exception exception)
        {
            sourceErrors.Add("Profile images unavailable (" + exception.GetType().Name + ").");
        }
    }

    private JObject FirstStream(JObject root)
    {
        JArray data = root["data"] as JArray;
        return data != null && data.Count > 0 ? data[0] as JObject : null;
    }

    private int CountSource(List<JObject> candidates, string source)
    {
        int count = 0;
        foreach (JObject candidate in candidates)
            if (String.Equals((string)candidate["source"], source, StringComparison.Ordinal)) count++;
        return count;
    }

    private List<string> ParseLogins(string raw, int maximum)
    {
        var output = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string part in (raw ?? "").Split(new[] { ',', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
        {
            string login = part.Trim().TrimStart('@').ToLowerInvariant();
            if (!IsLogin(login) || seen.Contains(login)) continue;
            output.Add(login);
            seen.Add(login);
            if (output.Count >= maximum) break;
        }
        return output;
    }

    private List<string> ParseSourceOrder(string raw)
    {
        var output = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (string part in (raw ?? "").Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries))
        {
            string source = part.Trim().ToLowerInvariant();
            if ((source == "preferred" || source == "followed" || source == "category") && !seen.Contains(source))
            {
                output.Add(source);
                seen.Add(source);
            }
        }
        foreach (string fallback in new[] { "preferred", "followed", "category" })
            if (!seen.Contains(fallback)) output.Add(fallback);
        return output;
    }

    private bool IsLogin(string value)
    {
        if (String.IsNullOrWhiteSpace(value) || value.Length > 25) return false;
        foreach (char character in value)
            if (!(character >= 'a' && character <= 'z') && !(character >= '0' && character <= '9') && character != '_') return false;
        return true;
    }

    private int BoundedInteger(JToken token, int fallback, int minimum, int maximum)
    {
        int value;
        return token != null && Int32.TryParse(token.ToString(), out value) ? Math.Max(minimum, Math.Min(maximum, value)) : fallback;
    }

    private int ReadInteger(string name, int fallback, int minimum, int maximum)
    {
        int value;
        return Int32.TryParse(Read(name), out value) ? Math.Max(minimum, Math.Min(maximum, value)) : fallback;
    }

    private bool ReadBoolean(string name, bool fallback)
    {
        bool value;
        return Boolean.TryParse(Read(name), out value) ? value : fallback;
    }

    private string Read(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? value.ToString().Trim() : "";
    }

    private string Bounded(string value, int maximum)
    {
        if (String.IsNullOrEmpty(value)) return "";
        return value.Length <= maximum ? value : value.Substring(0, maximum);
    }

    private bool Fail(string operation, string requestId, string relayToken, string error)
    {
        CPH.LogWarn("THSV Raid Scout: " + error);
        if (relayToken.Length >= 20) Emit(operation, requestId, relayToken, false, error, new JObject());
        CPH.SetArgument("raidScoutDiscoveryValid", false);
        CPH.SetArgument("raidScoutRaidAccepted", false);
        return false;
    }

    private void Emit(string operation, string requestId, string relayToken, bool success, string error, JObject details)
    {
        var payload = new JObject
        {
            ["operation"] = operation,
            ["requestId"] = requestId,
            ["success"] = success,
            ["error"] = error
        };
        foreach (JProperty property in details.Properties()) payload[property.Name] = property.Value;
        var envelope = new JObject
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = ResultEvent,
            ["sourceEventType"] = SourceName,
            ["relayId"] = "raid-scout-" + Guid.NewGuid().ToString("N"),
            ["relayToken"] = relayToken,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = false,
            ["payload"] = payload
        };
        CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None));
        CPH.SetArgument("raidScoutControllerSuccess", success);
        CPH.SetArgument("raidScoutControllerError", error);
        CPH.SetArgument("raidScoutControllerRequestId", requestId);
    }

    private static HttpClient CreateClient()
    {
        var client = new HttpClient();
        client.Timeout = TimeSpan.FromSeconds(12);
        return client;
    }
}
