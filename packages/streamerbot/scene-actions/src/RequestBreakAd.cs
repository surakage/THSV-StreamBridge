// Purpose: Requests one 180-second break ad through Raid Scout while OBS stays on the
// Be Right Back scene and the stream is live. Rate limited to one attempt per minute.
// References: mscorlib.dll, System.dll, System.Core.dll, System.Net.Http.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json.Linq;
public class CPHInline
{
    private static readonly object Gate = new object();
    private static long lastAttempt;
    private JObject Obs(string request)
    {
        JObject result = JObject.Parse(CPH.ObsSendRaw(request, "{}"));
        while (result["responseData"] is JObject) result = (JObject)result["responseData"];
        return result;
    }
    public bool Execute()
    {
        bool dry;
        if (CPH.TryGetArg<bool>("sceneMigrationDryRun", out dry) && dry)
        { CPH.LogInfo("THSV break ad offline compile check passed; no commercial requested."); return true; }
        lock (Gate)
        {
            string scene = (string)Obs("GetCurrentProgramScene")["currentProgramSceneName"];
            if (scene != "🔴 Be Right Back" && scene != "🟠 Be Right Back")
            { CPH.LogInfo("THSV break ad canceled: OBS has already left the break scene."); return false; }
            if ((bool?)Obs("GetStreamStatus")["outputActive"] != true)
            { CPH.LogInfo("THSV break ad skipped while offline."); return true; }
            long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            if (now - lastAttempt < 60000) return false;
            lastAttempt = now;
            CPH.SetArgument("raidScoutAdDurationSeconds", 180);
            CPH.SetArgument("raidScoutRequestId", "");
            CPH.SetArgument("thsvAddonRelayToken", "");
            return CPH.RunActionById("18a8de7c-1c5f-4a1e-8d58-7944c74060d5", true);
        }
    }
}
