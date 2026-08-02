// Purpose: Fetches a bounded list of public game giveaways from GamerPower for Free Game Check.
// Keep triggerless. The endpoint is fixed and no creator secret or arbitrary URL is accepted.
// References: mscorlib.dll, System.dll, System.Core.dll, System.Net.Http.dll, netstandard.dll, Newtonsoft.Json.dll.
using System;
using System.Net;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
public class CPHInline
{
    private const string Endpoint = "https://www.gamerpower.com/api/giveaways?type=game&sort-by=date";
    public bool Execute()
    {
        string token = Read("thsvAddonRelayToken", 100); if (token.Length < 20) return Fail("The broker relay token was missing.");
        string requestId = Read("freeGameCheckRequestId", 100); if (requestId.Length == 0) return Fail("The correlated refresh request ID was missing.");
        string body; try { var request = (HttpWebRequest)WebRequest.Create(Endpoint); request.Method = "GET"; request.Timeout = 12000; request.ReadWriteTimeout = 12000; request.UserAgent = "THSV-StreamBridge/2.x"; using (var response = (HttpWebResponse)request.GetResponse()) using (var reader = new System.IO.StreamReader(response.GetResponseStream())) { body = ReadBounded(reader, 1048576); } } catch (Exception error) { return Fail("Giveaway lookup failed (" + error.GetType().Name + ")."); }
        if (body.Length > 1048576) return Fail("The giveaway response exceeded 1 MiB."); JArray source; try { source = JArray.Parse(body); } catch { return Fail("The giveaway provider returned invalid JSON."); }
        var games = new JArray(); foreach (JToken item in source) { if (games.Count >= 100) break; string id = Bounded(Convert.ToString(item["id"]),80), title = Bounded(Convert.ToString(item["title"]),160), url = Bounded(Convert.ToString(item["gamerpower_url"]),500); Uri parsed; if (id.Length == 0 || title.Length == 0 || !Uri.TryCreate(url,UriKind.Absolute,out parsed) || parsed.Scheme != Uri.UriSchemeHttps || (parsed.Host.ToLowerInvariant() != "gamerpower.com" && parsed.Host.ToLowerInvariant() != "www.gamerpower.com")) continue; games.Add(new JObject { ["id"] = id, ["title"] = title, ["url"] = parsed.AbsoluteUri, ["platforms"] = Bounded(Convert.ToString(item["platforms"]),120), ["endDate"] = Bounded(Convert.ToString(item["end_date"]),80) }); }
        var envelope = new JObject{{"type","thsv.addon"},{"version","1.0.0"},{"moduleId","thsv.free-game-check"},{"eventType","addon.thsv.free-game-check.results"},{"sourceEventType","THSV Addon - Free Game Check - Refresh"},{"relayId",Guid.NewGuid().ToString("N")},{"relayToken",token},{"receivedAt",DateTimeOffset.UtcNow.ToString("O")},{"simulated",ReadBool("isTest")},{"payload",new JObject{{"requestId",requestId},{"games",games}}}};
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); } catch (Exception error) { return Fail("Giveaway relay failed (" + error.GetType().Name + ")."); } CPH.SetArgument("freeGameCheckValid",true); CPH.SetArgument("freeGameCheckCount",games.Count); return true;
    }
    private string Read(string key,int max){object value;return Bounded(CPH.TryGetArg(key,out value)&&value!=null?Convert.ToString(value).Trim():"",max);} private bool ReadBool(string key){bool value;return Boolean.TryParse(Read(key,10),out value)&&value;} private string Bounded(string value,int max){value=value??"";return value.Length<=max?value:value.Substring(0,max);} private bool Fail(string reason){CPH.SetArgument("freeGameCheckValid",false);CPH.SetArgument("freeGameCheckError",reason);CPH.LogWarn("THSV Free Game Check: "+reason);return false;}
    private string ReadBounded(System.IO.StreamReader reader,int maximum){var builder=new StringBuilder(Math.Min(maximum,8192));var buffer=new char[4096];int count;while((count=reader.Read(buffer,0,buffer.Length))>0){if(builder.Length+count>maximum)throw new InvalidOperationException("The giveaway response exceeded 1 MiB.");builder.Append(buffer,0,count);}return builder.ToString();}
}
