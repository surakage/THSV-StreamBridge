// Purpose: Read scene names for the authenticated local StreamBridge wizard without controlling scenes.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot/Newtonsoft.Json.dll.
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    public bool Execute()
    {
        string provider = Read("sceneCatalogProvider").ToLowerInvariant();
        if (provider.Length == 0) provider = "obs";
        int connectionIndex = ReadIndex();
        if (provider != "obs" && provider != "streamlabs" && provider != "meld")
            return Broadcast(provider, connectionIndex, new JArray(), "", false, "Unsupported scene provider.");

        if (provider != "obs")
            return Broadcast(provider, connectionIndex, new JArray(), "", false, "Full scene enumeration is unavailable; StreamBridge will use observed scene changes and manual entry.");

        try
        {
            if (!CPH.ObsIsConnected(connectionIndex))
                return Broadcast(provider, connectionIndex, new JArray(), "", false, "OBS is not connected in Streamer.bot.");
            string raw = CPH.ObsSendRaw("GetSceneList", "{}", connectionIndex);
            JObject response = JObject.Parse(raw);
            JToken data = response["responseData"] ?? response;
            JArray scenes = new JArray();
            JToken sceneList = data["scenes"];
            if (sceneList is JArray)
            {
                foreach (JToken scene in (JArray)sceneList)
                {
                    string name = CleanScene((string)scene["sceneName"]);
                    if (name.Length > 0 && scenes.Count < 256 && !Contains(scenes, name)) scenes.Add(name);
                }
            }
            string current = CleanScene((string)data["currentProgramSceneName"]);
            return Broadcast(provider, connectionIndex, scenes, current, true, "");
        }
        catch (Exception)
        {
            return Broadcast(provider, connectionIndex, new JArray(), "", false, "OBS scene discovery failed. Check the Streamer.bot OBS connection and try again.");
        }
    }

    private bool Broadcast(string provider, int connectionIndex, JArray scenes, string currentScene, bool complete, string error)
    {
        JObject envelope = new JObject
        {
            ["type"] = "thsv.scene-catalog",
            ["version"] = "1.0.0",
            ["provider"] = provider,
            ["relayId"] = Guid.NewGuid().ToString("D"),
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["connectionIndex"] = connectionIndex,
            ["connectionId"] = connectionIndex.ToString(),
            ["connectionName"] = provider == "obs" ? "OBS " + connectionIndex : provider,
            ["currentScene"] = currentScene,
            ["scenes"] = scenes,
            ["complete"] = complete,
            ["error"] = error
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception) { CPH.LogWarn("THSV scene catalog broadcast failed."); return false; }
        CPH.SetArgument("sceneCatalogValid", complete);
        CPH.SetArgument("sceneCatalogCount", scenes.Count);
        CPH.SetArgument("sceneCatalogError", error);
        return true;
    }

    private int ReadIndex()
    {
        int value;
        if (CPH.TryGetArg<int>("sceneCatalogConnectionIndex", out value) && value >= 0 && value <= 15) return value;
        string text = Read("sceneCatalogConnectionIndex");
        return Int32.TryParse(text, out value) && value >= 0 && value <= 15 ? value : 0;
    }

    private string Read(string name) { string value; return CPH.TryGetArg<string>(name, out value) ? Clean(value) : ""; }
    private static string Clean(string value)
    {
        if (String.IsNullOrWhiteSpace(value)) return "";
        char[] source = value.ToCharArray();
        for (int index = 0; index < source.Length; index++) if (Char.IsControl(source[index])) source[index] = ' ';
        string cleaned = String.Join(" ", new string(source).Split((char[])null, StringSplitOptions.RemoveEmptyEntries));
        return cleaned.Length <= 256 ? cleaned : cleaned.Substring(0, 256);
    }
    private static string CleanScene(string value)
    {
        if (String.IsNullOrWhiteSpace(value)) return "";
        char[] source = value.ToCharArray();
        for (int index = 0; index < source.Length; index++) if (Char.IsControl(source[index])) source[index] = ' ';
        string cleaned = new string(source).Trim();
        return cleaned.Length <= 256 ? cleaned : cleaned.Substring(0, 256);
    }
    private static bool Contains(JArray values, string expected) { foreach (JToken value in values) if (String.Equals((string)value, expected, StringComparison.Ordinal)) return true; return false; }
}
