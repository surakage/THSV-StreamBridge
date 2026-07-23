// Purpose: Relays one creator-triggered Quote Vault request to the installed add-on.
// The action can display a random quote or library counts on one explicitly selected platform.
// It never reads or writes quote files; the add-on remains the sole owner of private quote state.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using Newtonsoft.Json;

public class CPHInline
{
    public bool Execute()
    {
        string action;
        string sourcePlatform;
        if (!CPH.TryGetArg("quoteVaultControlAction", out action) || action == null) return false;
        if (!CPH.TryGetArg("quoteVaultSourcePlatform", out sourcePlatform) || sourcePlatform == null) sourcePlatform = "twitch";
        action = action.Trim().ToLowerInvariant();
        sourcePlatform = sourcePlatform.Trim().ToLowerInvariant();
        if (action != "random" && action != "stats") return false;
        if (sourcePlatform != "twitch" && sourcePlatform != "youtube" && sourcePlatform != "kick" && sourcePlatform != "tiktok") return false;

        string actionLabel = action == "random" ? "Random Quote" : "Statistics";
        var envelope = new Dictionary<string, object>
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = "thsv.quote-vault",
            ["eventType"] = "addon.thsv.quote-vault.control",
            ["sourceEventType"] = "THSV Addon - Quote Vault - " + actionLabel,
            ["relayId"] = "quote-vault-control-" + Guid.NewGuid().ToString("N"),
            ["relayToken"] = "",
            ["receivedAt"] = DateTime.UtcNow.ToString("o"),
            ["simulated"] = false,
            ["payload"] = new Dictionary<string, object>
            {
                ["action"] = action,
                ["sourcePlatform"] = sourcePlatform
            }
        };
        CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(envelope));
        CPH.SetArgument("quoteVaultControlRequested", true);
        CPH.SetArgument("quoteVaultControlOperation", action);
        CPH.SetArgument("quoteVaultControlPlatform", sourcePlatform);
        CPH.LogInfo("THSV Quote Vault " + action + " request relayed for " + sourcePlatform + ".");
        return true;
    }
}
