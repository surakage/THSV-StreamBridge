// Purpose: Stops OBS's main stream plus active service-backed plug-in outputs such as Aitum
// Multistream. Recording, replay-buffer, virtual-camera, and other non-service outputs are left
// alone. Keep this action triggerless and approve/select it only when Raid Scout auto-end is armed.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const int ObsOutputServiceFlag = 8;

    public bool Execute()
    {
        int stoppedPluginOutputs = 0;
        int failedPluginOutputs = 0;
        var requestedPluginOutputs = new List<string>();

        try
        {
            string response = CPH.ObsSendRaw("GetOutputList", "{}");
            JObject root = JObject.Parse(String.IsNullOrWhiteSpace(response) ? "{}" : response);
            JObject responseData = root["responseData"] as JObject;
            if (responseData == null) responseData = root;
            JArray outputs = responseData["outputs"] as JArray;

            if (outputs != null)
            {
                foreach (JObject output in outputs.OfType<JObject>())
                {
                    if (output.Value<bool?>("outputActive") != true) continue;
                    string outputName = Bounded(output.Value<string>("outputName"), 200);
                    string outputKind = Bounded(output.Value<string>("outputKind"), 100).ToLowerInvariant();
                    int outputFlags = output.Value<int?>("outputFlags") ?? 0;
                    string lowerName = outputName.ToLowerInvariant();

                    // Aitum creates outputs with the stable aitum_multi_output_ prefix. Current
                    // obs-websocket output records do not guarantee outputFlags, so also recognize
                    // every transport kind Aitum itself can create (RTMP, WHIP, FTL, and MPEG-TS).
                    bool isStreamingOutput = (outputFlags & ObsOutputServiceFlag) != 0
                        || lowerName.StartsWith("aitum_multi_output_")
                        || outputKind.Contains("rtmp") || outputKind.Contains("whip")
                        || outputKind.Contains("ftl") || outputKind.Contains("mpegts") || outputKind.Contains("mpeg_ts");
                    if (!isStreamingOutput || outputName.Length == 0) continue;

                    // Leave OBS's built-in main output until last. This keeps the Streaming
                    // Stopped confirmation from racing ahead of Aitum's extra destinations.
                    bool isMainObsOutput = lowerName == "simple_stream" || lowerName == "adv_stream"
                        || lowerName == "rtmp_output";
                    if (isMainObsOutput) continue;

                    try
                    {
                        var request = new JObject { ["outputName"] = outputName };
                        string stopResponse = CPH.ObsSendRaw("StopOutput", request.ToString(Formatting.None));
                        EnsureRequestSucceeded(stopResponse, "StopOutput");
                        requestedPluginOutputs.Add(outputName);
                    }
                    catch (Exception error)
                    {
                        failedPluginOutputs++;
                        CPH.LogWarn("THSV Raid Scout could not stop one OBS streaming output: " + error.Message);
                    }
                }

                // StopOutput acknowledges the request before every plug-in necessarily finishes
                // tearing down its network transport. Confirm each Aitum/service output is inactive
                // before stopping OBS main so a slow secondary destination cannot be left behind.
                // Every plug-in shares one deadline. Ten failed secondary outputs therefore add
                // no more delay than one failed output before OBS main is stopped.
                int confirmationDeadline = Environment.TickCount + 3000;
                foreach (string outputName in requestedPluginOutputs)
                {
                    if (WaitForOutputToStopUntil(outputName, confirmationDeadline))
                    {
                        stoppedPluginOutputs++;
                        CPH.LogInfo("THSV Raid Scout confirmed OBS plug-in streaming output '" + outputName + "' stopped.");
                    }
                    else
                    {
                        failedPluginOutputs++;
                        CPH.LogWarn("THSV Raid Scout could not confirm OBS plug-in streaming output '" + outputName + "' stopped before the timeout.");
                    }
                }
            }
        }
        catch (Exception error)
        {
            // The documented main-output stop below is still safe to attempt when an older OBS
            // or plug-in does not expose GetOutputList.
            CPH.LogWarn("THSV Raid Scout could not inspect OBS plug-in outputs: " + error.Message);
        }

        if (failedPluginOutputs > 0)
            CPH.LogWarn("THSV Raid Scout is continuing to stop OBS main even though one or more plug-in outputs could not be confirmed offline.");

        try
        {
            if (CPH.ObsIsStreaming()) CPH.ObsStopStreaming();
        }
        catch (Exception error)
        {
            CPH.SetArgument("raidScoutStopAllSuccess", false);
            CPH.SetArgument("raidScoutStopAllError", Bounded(error.Message, 300));
            CPH.SetArgument("raidScoutStoppedPluginOutputs", stoppedPluginOutputs);
            CPH.SetArgument("raidScoutFailedPluginOutputs", failedPluginOutputs);
            CPH.LogError("THSV Raid Scout could not stop the main OBS stream: " + error.Message);
            return false;
        }

        CPH.SetArgument("raidScoutStopAllSuccess", failedPluginOutputs == 0);
        CPH.SetArgument("raidScoutStopAllError", failedPluginOutputs == 0 ? "" : "One or more OBS plug-in streaming outputs could not be stopped.");
        CPH.SetArgument("raidScoutStoppedPluginOutputs", stoppedPluginOutputs);
        CPH.SetArgument("raidScoutFailedPluginOutputs", failedPluginOutputs);
        return failedPluginOutputs == 0;
    }

    private bool WaitForOutputToStopUntil(string outputName, int deadline)
    {
        var request = new JObject { ["outputName"] = outputName }.ToString(Formatting.None);
        while (unchecked(Environment.TickCount - deadline) < 0)
        {
            try
            {
                string response = CPH.ObsSendRaw("GetOutputStatus", request);
                JObject root = JObject.Parse(String.IsNullOrWhiteSpace(response) ? "{}" : response);
                JObject status = root["requestStatus"] as JObject;
                // An output removed during shutdown is no longer active and therefore counts as
                // stopped even if OBS reports that its name can no longer be found.
                if (status != null && status.Value<bool?>("result") == false) return true;
                JObject responseData = root["responseData"] as JObject;
                if (responseData == null) responseData = root;
                if (responseData.Value<bool?>("outputActive") != true) return true;
            }
            catch (Exception error)
            {
                CPH.LogWarn("THSV Raid Scout could not inspect output '" + outputName + "' while waiting for it to stop: " + error.Message);
                return false;
            }
            Thread.Sleep(100);
        }
        return false;
    }

    private void EnsureRequestSucceeded(string response, string requestName)
    {
        if (String.IsNullOrWhiteSpace(response)) return;
        JObject root = JObject.Parse(response);
        JObject status = root["requestStatus"] as JObject;
        if (status == null || status.Value<bool?>("result") != false) return;
        string comment = Bounded(status.Value<string>("comment"), 240);
        throw new InvalidOperationException(requestName + " was rejected by OBS" + (comment.Length == 0 ? "." : ": " + comment));
    }

    private string Bounded(string value, int maximum)
    {
        string clean = (value ?? "").Replace("\r", " ").Replace("\n", " ").Trim();
        return clean.Length <= maximum ? clean : clean.Substring(0, maximum);
    }
}
