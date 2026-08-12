// Purpose: Mirror compatible approved Quote Vault records into Streamer.bot's native quote store, or export the native store back to Quote Vault.
// References: https://docs.streamer.bot/api/csharp/methods/core/quotes https://docs.streamer.bot/api/csharp/classes/quote-data
using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Streamer.bot.Plugin.Interface.Model;

public class CPHInline
{
    public bool Execute()
    {
        string operation = Read("quoteVaultSyncOperation").ToLowerInvariant();
        string token = Read("thsvAddonRelayToken");
        if (token.Length < 20) return false;
        if (operation == "export-all") return ExportAll(token);

        int vaultId = ReadInt("quoteVaultQuoteId");
        int nativeId = ReadInt("quoteVaultNativeQuoteId");
        string platform = Read("quoteVaultPlatform").ToLowerInvariant();
        string quotedUserId = Read("quoteVaultUserId");
        string text = Read("quoteVaultQuoteText");
        bool success = false;
        int resultingId = nativeId;
        string error = "";
        try
        {
            if (operation == "delete") success = nativeId > 0 && CPH.DeleteQuote(nativeId);
            else if (operation == "replace")
            {
                if (nativeId > 0) CPH.DeleteQuote(nativeId);
                resultingId = Add(platform, quotedUserId, text);
                success = resultingId > 0;
            }
            else if (operation == "add")
            {
                resultingId = Add(platform, quotedUserId, text);
                success = resultingId > 0;
            }
            else error = "Unsupported quote sync operation.";
        }
        catch (Exception exception) { error = "Native quote operation failed (" + exception.GetType().Name + ")."; }
        Relay(token, operation, new Dictionary<string, object> { ["quoteVaultQuoteId"] = vaultId, ["nativeQuoteId"] = resultingId, ["success"] = success, ["error"] = Bound(error, 180) });
        return success;
    }

    private int Add(string platform, string quotedUserId, string text)
    {
        if (String.IsNullOrWhiteSpace(text)) return 0;
        if (platform == "twitch") return CPH.AddQuoteForTwitch(String.IsNullOrWhiteSpace(quotedUserId) ? CPH.TwitchGetBroadcaster().UserId : quotedUserId, text, true);
        if (platform == "youtube") return CPH.AddQuoteForYouTube(String.IsNullOrWhiteSpace(quotedUserId) ? CPH.YouTubeGetBroadcaster().UserId : quotedUserId, text);
        if (platform == "kick") return CPH.AddQuoteForKick(String.IsNullOrWhiteSpace(quotedUserId) ? CPH.KickGetBroadcaster().UserId : quotedUserId, text, true);
        return 0;
    }

    private bool ExportAll(string token)
    {
        var quotes = new List<Dictionary<string, object>>();
        int expected = Math.Min(CPH.GetQuoteCount(), 150);
        int misses = 0;
        for (int id = 1; id <= 10000 && quotes.Count < expected && misses < 2000; id++)
        {
            QuoteData quote = null;
            try { quote = CPH.GetQuote(id); } catch { }
            if (quote == null) { misses++; continue; }
            misses = 0;
            string platform = Bound(quote.Platform, 20).ToLowerInvariant();
            if (platform != "twitch" && platform != "youtube" && platform != "kick") continue;
            quotes.Add(new Dictionary<string, object> {
                ["id"] = quote.Id,
                ["text"] = Bound(quote.Quote, 400),
                ["quotedName"] = Bound(quote.User, 100),
                ["platform"] = platform,
                ["gameName"] = Bound(quote.GameName, 200),
                ["timestamp"] = quote.Timestamp.ToUniversalTime().ToString("o")
            });
        }
        Relay(token, "export-all", new Dictionary<string, object> { ["quotes"] = quotes, ["success"] = true, ["error"] = "" });
        return true;
    }

    private void Relay(string token, string operation, Dictionary<string, object> payload)
    {
        payload["operation"] = operation;
        var envelope = new Dictionary<string, object> {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = "thsv.quote-vault",
            ["eventType"] = "addon.thsv.quote-vault.sync-result", ["sourceEventType"] = "THSV Addon - Quote Vault - Native Quote Sync",
            ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token, ["receivedAt"] = DateTime.UtcNow.ToString("o"),
            ["simulated"] = false, ["payload"] = payload
        };
        CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(envelope));
    }

    private string Read(string name) { object value; return CPH.TryGetArg(name, out value) && value != null ? Bound(value.ToString(), 1000).Trim() : ""; }
    private int ReadInt(string name) { int value; return Int32.TryParse(Read(name), out value) ? Math.Max(0, value) : 0; }
    private string Bound(string value, int maximum) { value = value ?? ""; return value.Length <= maximum ? value : value.Substring(0, maximum); }
}
