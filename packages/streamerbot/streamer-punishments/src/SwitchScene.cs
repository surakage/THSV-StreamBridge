// Purpose: Switches OBS to one exact scene for a broker-authorized Streamer Punishments
// exercise (the safe scene after the grace countdown, and back when it is done).
// Keep this action triggerless.
// References: mscorlib.dll and System.dll.
using System;

public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 200);
        string scene = Read("punishmentSceneName", 256);
        int connection;
        if (!int.TryParse(Read("punishmentConnectionIndex", 2), out connection) || connection < 0 || connection > 23) connection = 0;
        if (token.Length < 20) return Fail("The StreamBridge broker token was missing; run this action from StreamBridge only.");
        if (scene.Length == 0) return Fail("No scene name was supplied.");
        if (!CPH.ObsIsConnected(connection)) return Fail("OBS is not connected.");
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
