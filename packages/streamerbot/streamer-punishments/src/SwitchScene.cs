// Purpose: Switches your streaming app to one exact scene for a broker-authorized Streamer Punishments
// exercise (the safe scene after the grace countdown, and back when it is done).
// The app is StreamBridge's chosen streaming app (thsvStreamingApp): OBS and SprigCast (through its
// OBS-compatible door) use Streamer.bot's OBS connection, Streamlabs and Meld their own connections.
// Keep this action triggerless.
// References: mscorlib.dll and System.dll.
using System;

public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 200);
        string scene = Read("punishmentSceneName", 256);
        string app = Read("thsvStreamingApp", 20).ToLowerInvariant();
        int connection;
        if (!int.TryParse(Read("punishmentConnectionIndex", 2), out connection) || connection < 0 || connection > 23) connection = 0;
        if (token.Length < 20) return Fail("The StreamBridge broker token was missing; run this action from StreamBridge only.");
        if (scene.Length == 0) return Fail("No scene name was supplied.");
        if (app == "streamlabs") { CPH.SlobsSetScene(scene, connection); return true; }
        if (app == "meld") return CPH.MeldStudioShowSceneByName(scene, connection) || Fail("Meld Studio did not show scene " + scene + ".");
        if (!CPH.ObsIsConnected(connection)) return Fail((app == "sprigcast" ? "SprigCast" : "OBS") + " is not connected to Streamer.bot's OBS connection.");
        CPH.ObsSetScene(scene, connection);
        return true;
    }

    private string Read(string name, int maximum)
    {
        object value;
        string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value).Trim() : "";
        text = text.Replace("\r", " ").Replace("\n", " ");
        return text.Length <= maximum ? text : text.Substring(0, maximum);
    }

    private bool Fail(string reason)
    {
        CPH.LogWarn("THSV Streamer Punishments: " + reason);
        return false;
    }
}
