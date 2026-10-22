// Purpose: Stops an action on the wrong scene. Put it at the top of a Kick reward or command action
// (Kick rewards cannot be turned off by Streamer.bot), or of any other action:
//   1. Set Argument  gateId = the gate's name from the wizard (for example "hydrate")
//   2. Run Action    THSV Scene Gate - Check  (Run Immediately ticked)
//   3. If/Else       sceneGateAllowed equals False  ->  Break
// It reads the temporary global variable "thsvGate.<gateId>" that THSV Scene Gate - Apply keeps up
// to date. When the gate is closed it replies in the chat the trigger came from and returns false.
// A gate StreamBridge has not set yet counts as open. Keep this action triggerless.
// Optional arguments: gateReply = false to stop without replying; gateReplyPlatform = twitch,
// youtube or kick to choose where the reply goes.
// References: mscorlib.dll and System.dll.
using System;
using System.Text;
using System.Text.RegularExpressions;

public class CPHInline
{
    public bool Execute()
    {
        string gate = GateIdFor(Read("gateId", 80));
        if (gate.Length == 0) gate = GateIdFor(Read("sceneGateId", 80));
        CPH.SetArgument("sceneGateId", gate);
        if (gate.Length == 0)
        {
            CPH.LogWarn("THSV Scene Gate - Check: add a Set Argument gateId sub-action before running this action.");
            return Allow();
        }

        bool? allowed = CPH.GetGlobalVar<bool?>("thsvGate." + gate, false);
        if (allowed != false) return Allow();

        CPH.SetArgument("sceneGateAllowed", false);
        string message = CPH.GetGlobalVar<string>("thsvGateMessage." + gate, false) ?? "";
        string user = Read("user", 80);
        if (user.Length == 0) user = Read("userName", 80);
        message = message.Replace("{user}", user).Trim();
        CPH.SetArgument("sceneGateMessage", message);
        if (message.Length > 0 && !Read("gateReply", 10).Equals("false", StringComparison.OrdinalIgnoreCase))
        {
            try { Reply(Platform(), message); }
            catch (Exception error) { CPH.LogWarn("THSV Scene Gate - Check: the wrong-scene reply failed (" + error.GetType().Name + ")."); }
        }
        return false;
    }

    private bool Allow()
    {
        CPH.SetArgument("sceneGateAllowed", true);
        return true;
    }

    private void Reply(string platform, string message)
    {
        if (platform == "kick") CPH.SendKickMessage(message, true, true);
        else if (platform == "youtube") CPH.SendYouTubeMessageToLatestMonitored(message, true, true);
        else if (platform == "twitch") CPH.SendMessage(message, true, true);
    }

    // Where the trigger came from: an explicit gateReplyPlatform, the command or event source, or the event type.
    private string Platform()
    {
        string[] names = { "gateReplyPlatform", "commandSource", "eventSource", "__source" };
        foreach (string name in names)
        {
            string platform = PlatformOf(Read(name, 60));
            if (platform.Length > 0) return platform;
        }
        try { return PlatformOf(CPH.GetEventType().ToString()); }
        catch (Exception) { return ""; }
    }

    private static string PlatformOf(string value)
    {
        value = value.ToLowerInvariant();
        if (value.Contains("kick")) return "kick";
        if (value.Contains("youtube")) return "youtube";
        if (value.Contains("twitch")) return "twitch";
        return "";
    }

    // The same rule StreamBridge uses for gate names: lowercase letters and digits joined by dashes.
    private static string GateIdFor(string value)
    {
        string text = Regex.Replace(value.ToLowerInvariant().Normalize(NormalizationForm.FormKD), "[^a-z0-9]+", "-").Trim('-');
        if (text.Length > 40) text = text.Substring(0, 40).TrimEnd('-');
        return text;
    }

    private string Read(string name, int maximum)
    {
        object value;
        string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value).Trim() : "";
        text = text.Replace("\r", " ").Replace("\n", " ");
        return text.Length <= maximum ? text : text.Substring(0, maximum);
    }
}
