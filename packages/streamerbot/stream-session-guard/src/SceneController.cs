// Purpose: Changes one exact OBS, Meld, or Streamlabs scene after StreamBridge validates
// the live-session deadline. Keep this broker-dispatched action triggerless.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken"); string moduleId = Read("sessionGuardModuleId"); string resultEvent = Read("sessionGuardResultEvent");
        string requestId = Read("sessionGuardRequestId"); string purpose = Read("sessionGuardPurpose"); string provider = Read("sessionGuardProvider"); string sceneName = Read("sessionGuardSceneName");
        int connectionIndex = ReadInt("sessionGuardConnectionIndex", 0, 23, 0);
        if (token.Length < 20 || moduleId != "thsv.stream-session-guard" || resultEvent != "addon.thsv.stream-session-guard.scene-result" || requestId.Length == 0 || sceneName.Length == 0) return Fail("the broker authorization or scene arguments were missing.");
        bool success = false; string error = "";
        try
        {
            if (provider == "obs") { CPH.ObsSetScene(sceneName, connectionIndex); success = true; }
            else if (provider == "streamlabs") { CPH.SlobsSetScene(sceneName, connectionIndex); success = true; }
            else if (provider == "meld") success = CPH.MeldStudioShowSceneByName(sceneName, connectionIndex);
            else error = "unsupported broadcast app";
        }
        catch (Exception exception) { error = exception.GetType().Name; CPH.LogWarn("THSV Stream Break & End Guard scene change failed (" + error + ")."); }
        var envelope = new JObject
        {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = moduleId, ["eventType"] = resultEvent,
            ["sourceEventType"] = "THSV Extension - Stream Break & End Guard - Scene Controller", ["relayId"] = Guid.NewGuid().ToString("N"), ["relayToken"] = token,
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = false,
            ["payload"] = new JObject { ["requestId"] = requestId, ["purpose"] = purpose, ["provider"] = provider, ["sceneName"] = sceneName, ["success"] = success, ["error"] = error }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception exception) { return Fail("the scene result could not be relayed (" + exception.GetType().Name + ")."); }
        CPH.SetArgument("sessionGuardSuccess", success); CPH.SetArgument("sessionGuardError", error); return success;
    }
    private string Read(string name) { object value; return CPH.TryGetArg(name, out value) && value != null ? Clean(Convert.ToString(value, CultureInfo.InvariantCulture), 256) : ""; }
    private int ReadInt(string name, int minimum, int maximum, int fallback) { int value; return Int32.TryParse(Read(name), NumberStyles.Integer, CultureInfo.InvariantCulture, out value) ? Math.Max(minimum, Math.Min(maximum, value)) : fallback; }
    private string Clean(string value, int maximum) { value = (value ?? "").Trim(); return value.Length <= maximum ? value : value.Substring(0, maximum); }
    private bool Fail(string reason) { CPH.SetArgument("sessionGuardSuccess", false); CPH.SetArgument("sessionGuardError", reason); CPH.LogError("THSV Stream Break & End Guard controller failed: " + reason); return false; }
}
