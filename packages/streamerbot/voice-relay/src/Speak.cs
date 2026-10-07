// Purpose: Prepares one private phrase for the native WebSocket Speak sub-action.
// References: mscorlib.dll, System.dll, netstandard.dll.
using System;
using System.IO;
using System.Text;
using Newtonsoft.Json.Linq;
public class CPHInline
{
    public bool Execute()
    {
        CPH.SetArgument("voiceRelayPreparedMessage", "");
        CPH.SetArgument("voiceRelayPrepared", false);
        string token = Read("thsvAddonRelayToken", 100), voice = Read("voiceRelayVoiceAlias", 80), handoff = Read("voiceRelayMessageHandoff", 80), handoffRoot = Read("voiceRelayHandoffRoot", 1024);
        if (token.Length < 20 || handoff.Length == 0 || handoffRoot.Length == 0) return Fail("The broker token or secure speech handoff was missing.");
        if (voice.Length == 0) return Fail("Create a Speaker.bot Voice Alias and enter that exact alias in the StreamBridge wizard.");
        string path = "";
        try
        {
            Guid id;
            if (!handoff.StartsWith("voice-", StringComparison.OrdinalIgnoreCase) || !handoff.EndsWith(".txt", StringComparison.OrdinalIgnoreCase) || !Guid.TryParseExact(handoff.Substring(6, handoff.Length - 10), "D", out id) || !String.Equals(handoff, "voice-" + id.ToString("D") + ".txt", StringComparison.OrdinalIgnoreCase) || Path.GetFileName(handoff) != handoff) return Fail("The secure speech handoff name was invalid.");
            string root = Path.GetFullPath(handoffRoot);
            DirectoryInfo rootInfo = new DirectoryInfo(root);
            if (!String.Equals(rootInfo.Name, "voice-relay-inbox", StringComparison.OrdinalIgnoreCase) || rootInfo.Parent == null || !String.Equals(rootInfo.Parent.Name, "runtime", StringComparison.OrdinalIgnoreCase)) return Fail("The secure speech handoff root was rejected.");
            path = Path.GetFullPath(Path.Combine(root, handoff));
            if (!path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) return Fail("The secure speech handoff path was rejected.");
            FileInfo info = new FileInfo(path);
            if (!rootInfo.Exists || (rootInfo.Attributes & FileAttributes.ReparsePoint) != 0 || !info.Exists || (info.Attributes & FileAttributes.ReparsePoint) != 0) return Fail("The secure speech handoff was missing or unsafe.");
            string message;
            using (FileStream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.None))
            {
                if (stream.Length <= 0 || stream.Length > 4096) return Fail("The secure speech handoff was empty or oversized.");
                using (StreamReader reader = new StreamReader(stream, new UTF8Encoding(false, true), false, 1024, true)) message = reader.ReadToEnd().Trim();
            }
            File.Delete(path); path = "";
            if (message.Length == 0 || message.Length > 400) return Fail("The secure speech phrase was empty or oversized.");
            CPH.SetArgument("voiceRelayPreparedMessage", message);
            CPH.SetArgument("voiceRelayPrepared", true);
            return true;
        }
        catch (Exception error) { return Fail("Speaker.bot request failed (" + error.GetType().Name + ")."); }
        finally { if (path.Length > 0) try { File.Delete(path); } catch { } }
    }
    private string Read(string key, int max) { object value; string text = CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : ""; return text.Length <= max ? text : text.Substring(0, max); }
    private bool Fail(string reason)
    {
        CPH.SetArgument("voiceRelaySuccess", false); CPH.SetArgument("voiceRelayError", reason);
        CPH.LogWarn("THSV Voice Relay: " + reason);
        string executionId = Read("voiceRelayExecutionId", 100), token = Read("thsvAddonRelayToken", 100);
        if (executionId.Length > 0 && token.Length >= 20)
            CPH.WebsocketBroadcastJson(new JObject { ["type"] = "thsv.voice-result", ["executionId"] = executionId, ["relayToken"] = token, ["success"] = false, ["durationMs"] = 0 }.ToString(Newtonsoft.Json.Formatting.None));
        return false;
    }
}
