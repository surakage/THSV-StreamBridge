// Purpose: Stops OBS's main stream plus active service-backed plug-in outputs such as Aitum
// Multistream. Recording, replay-buffer, virtual-camera, and other non-service outputs are left
// alone. Keep this action triggerless and approve/select it only when Raid Scout auto-end is armed.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled Newtonsoft.Json.dll.
using System;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const int ObsOutputServiceFlag = 8;

    public bool Execute()
    {
        int stoppedPluginOutputs = 0;
        int failedPluginOutputs = 0;

        try
        {
            string response = CPH.ObsSendRaw("GetOutputList", "{}");
            JObject root = JObject.Parse(String.IsNullOrWhiteSpace(response) ? "{}" : response);
            JToken responseData = root["responseData"] ?? root;
            JArray outputs = responseData["outputs"] as JArray;

            if (outputs != null)
            {
                foreach (JObject output in outputs.OfType<JObject>())
                {
                    if (output.Value<bool?>("outputActive") != true) continue;
                    string outputName = Bounded(output.Value<string>("outputName"), 200);
                    string outputKind = Bounded(output.Value<string>("outputKind"), 100).ToLowerInvariant();
                    int outputFlags = output.Value<int?>("outputFlags") ?? 0;

                    // OBS_OUTPUT_SERVICE identifies streaming/service outputs. The kind fallback
                    // covers plug-ins that omit the flags field but expose their transport kind.
                    bool isStreamingOutput = (outputFlags & ObsOutputServiceFlag) != 0
                        || outputKind.Contains("rtmp") || outputKind.Contains("whip");
                    if (!isStreamingOutput || outputName.Length == 0) continue;

                    // Leave OBS's built-in main output until last. This keeps the Streaming
                    // Stopped confirmation from racing ahead of Aitum's extra destinations.
                    string lowerName = outputName.ToLowerInvariant();
                    bool isMainObsOutput = lowerName == "simple_stream" || lowerName == "adv_stream"
                        || lowerName == "rtmp_output";
                    if (isMainObsOutput) continue;

                    try
                    {
                        var request = new JObject { ["outputName"] = outputName };
                        CPH.ObsSendRaw("StopOutput", request.ToString(Formatting.None));
                        stoppedPluginOutputs++;
                    }
                    catch (Exception error)
                    {
                        failedPluginOutputs++;
                        CPH.LogWarn("THSV Raid Scout could not stop one OBS streaming output: " + error.Message);
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

    private string Bounded(string value, int maximum)
    {
        string clean = (value ?? "").Replace("\r", " ").Replace("\n", " ").Trim();
        return clean.Length <= maximum ? clean : clean.Substring(0, maximum);
    }
}
