// Purpose: Relays one documented OBS Studio, Streamlabs Desktop, or Meld Studio Scene Changed
// trigger into THSV StreamBridge. The bridge performs stable-ID mapping and loop protection.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot/Newtonsoft.Json.dll.
// Triggers: attach OBS Studio > Scene Changed, Streamlabs Desktop > Scene Changed, and/or
// Meld Studio > Scene Changed to this one action. Do not attach chat or unrelated triggers.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const int MaximumTextLength = 256;

    public bool Execute()
    {
        SetResult(false, "", "", "", "");
        string provider;
        string sceneName;
        string oldSceneName;
        string connectionId;
        string connectionName;
        string error;
        if (!TryReadScene(out provider, out sceneName, out oldSceneName, out connectionId, out connectionName, out error))
            return Fail(error);

        JObject envelope = new JObject
        {
            ["type"] = "thsv.scene",
            ["version"] = "1.0.0",
            ["provider"] = provider,
            ["sourceEventType"] = Clean(CPH.GetEventType().ToString(), 100),
            ["relayId"] = Guid.NewGuid().ToString("D"),
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["simulated"] = ReadBool("isTest"),
            ["connectionId"] = connectionId,
            ["connectionName"] = connectionName,
            ["sceneName"] = sceneName,
            ["oldSceneName"] = oldSceneName
        };

        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception) { return Fail("Scene relay broadcast failed. Check the local Streamer.bot WebSocket server and try again."); }
        SetResult(true, provider, sceneName, connectionName, "");
        return true;
    }

    private bool TryReadScene(out string provider, out string sceneName, out string oldSceneName, out string connectionId, out string connectionName, out string error)
    {
        provider = ""; sceneName = ""; oldSceneName = ""; connectionId = ""; connectionName = ""; error = "";
        string obsScene = Read("obs.sceneName");
        string streamlabsScene = Read("sd.sceneName");
        string meldScene = Read("meldStudio.sceneName");
        int matches = (obsScene.Length > 0 ? 1 : 0) + (streamlabsScene.Length > 0 ? 1 : 0) + (meldScene.Length > 0 ? 1 : 0);
        if (matches != 1) { error = matches == 0 ? "No supported Scene Changed trigger arguments were found." : "Arguments from more than one scene provider were found."; return false; }

        if (obsScene.Length > 0)
        {
            provider = "obs"; sceneName = obsScene; oldSceneName = Read("obs.oldSceneName");
            connectionId = Read("obs.id"); connectionName = Read("obs.name"); return true;
        }
        if (streamlabsScene.Length > 0)
        {
            provider = "streamlabs"; sceneName = streamlabsScene;
            connectionId = Read("sd.id"); connectionName = Read("sd.name"); return true;
        }
        provider = "meld"; sceneName = meldScene; oldSceneName = Read("meldStudio.oldSceneName");
        connectionId = Read("meldStudio.id"); connectionName = Read("meldStudio.name"); return true;
    }

    private string Read(string name)
    {
        string value;
        return CPH.TryGetArg<string>(name, out value) ? Clean(value, MaximumTextLength) : "";
    }

    private bool ReadBool(string name)
    {
        bool value;
        if (CPH.TryGetArg<bool>(name, out value)) return value;
        string text;
        return CPH.TryGetArg<string>(name, out text) && bool.TryParse(text, out value) && value;
    }

    private static string Clean(string value, int maximum)
    {
        if (String.IsNullOrWhiteSpace(value)) return "";
        char[] source = value.ToCharArray();
        for (int index = 0; index < source.Length; index++) if (Char.IsControl(source[index])) source[index] = ' ';
        string normalized = String.Join(" ", new string(source).Split((char[])null, StringSplitOptions.RemoveEmptyEntries));
        return normalized.Length <= maximum ? normalized : normalized.Substring(0, maximum);
    }

    private bool Fail(string error)
    {
        string safeError = Clean(error, MaximumTextLength);
        SetResult(false, "", "", "", safeError);
        CPH.LogWarn("THSV Scene Actions intake: " + safeError);
        return false;
    }

    private void SetResult(bool valid, string provider, string sceneName, string connectionName, string error)
    {
        CPH.SetArgument("sceneRelayValid", valid);
        CPH.SetArgument("sceneRelayProvider", provider);
        CPH.SetArgument("sceneRelaySceneName", sceneName);
        CPH.SetArgument("sceneRelayConnectionName", connectionName);
        CPH.SetArgument("sceneRelayError", error);
    }
}
