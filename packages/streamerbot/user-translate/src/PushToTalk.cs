// Purpose: Relays one creator Stream Deck press for Translate push to talk to the local StreamBridge.
// Set pushToTalkAction to toggle (one button), or start and stop (two buttons). Optional per button:
// pushToTalkOutput (chat, captions or both), pushToTalkPlatforms (for example youtube or twitch,kick)
// and pushToTalkLanguages (for example es or es,ja). Empty values use the wizard settings.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.user-translate";

    public bool Execute()
    {
        string action = Read("pushToTalkAction").ToLowerInvariant();
        if (action.Length == 0) action = "toggle";
        if (action != "toggle" && action != "start" && action != "stop") return Fail("pushToTalkAction must be toggle, start or stop.");
        string output = Read("pushToTalkOutput").ToLowerInvariant();
        if (output != "" && output != "chat" && output != "captions" && output != "both") return Fail("pushToTalkOutput must be empty, chat, captions or both.");
        string platforms = Read("pushToTalkPlatforms").ToLowerInvariant().Replace(" ", "");
        foreach (string platform in platforms.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)) if (platform != "twitch" && platform != "youtube" && platform != "kick" && platform != "tiktok" && platform != "facebook") return Fail("pushToTalkPlatforms may list only twitch, youtube, kick, tiktok and facebook.");
        if (platforms.Length > 80) return Fail("pushToTalkPlatforms is too long.");
        string languages = Read("pushToTalkLanguages").ToLowerInvariant().Replace(" ", "");
        if (languages.Length > 80 || !System.Text.RegularExpressions.Regex.IsMatch(languages, "^[a-z0-9,-]*$")) return Fail("pushToTalkLanguages must be language codes such as es or es,ja.");
        string relayId = Guid.NewGuid().ToString("N");
        var envelope = new JObject { ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId, ["eventType"] = "addon.thsv.user-translate.push-to-talk", ["sourceEventType"] = "THSV Addon - Translate - Push to Talk - " + action, ["relayId"] = relayId, ["relayToken"] = "", ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false, ["payload"] = new JObject { ["action"] = action, ["output"] = output, ["platforms"] = platforms, ["languages"] = languages } };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { return Fail("the push to talk press could not be relayed (" + error.GetType().Name + ")."); }
        CPH.SetArgument("pushToTalkValid", true); CPH.SetArgument("pushToTalkError", "");
        CPH.LogInfo("THSV Translate push to talk relayed: " + action + "."); return true;
    }

    private string Read(string name) { object value; return CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture).Trim() : ""; }
    private bool Fail(string reason) { CPH.SetArgument("pushToTalkValid", false); CPH.SetArgument("pushToTalkError", reason); CPH.LogError("THSV Translate push to talk failed: " + reason); return false; }
}
