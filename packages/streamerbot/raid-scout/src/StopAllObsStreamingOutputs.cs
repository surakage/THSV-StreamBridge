// Purpose: Stops OBS's main stream plus active service-backed plug-in outputs such as Aitum
// Multistream. Recording, replay-buffer, virtual-camera, and other non-service outputs are left
// alone. Keep this action triggerless and approve/select it only when Raid Scout auto-end is armed.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using System.Threading;
using Newtonsoft.Json;

public class CPHInline
{
    private const int ObsOutputServiceFlag = 8;

    public bool Execute()
    {
        int stoppedPluginOutputs = 0;
        int failedPluginOutputs = 0;
        var requestedPluginOutputs = new List<string>();
        bool verticalStopRequested = false;

        try
        {
            string response = CPH.ObsSendRaw("GetOutputList", "{}");
            ObsResponse root = JsonConvert.DeserializeObject<ObsResponse>(String.IsNullOrWhiteSpace(response) ? "{}" : response) ?? new ObsResponse();
            ObsResponseData responseData = root.responseData ?? new ObsResponseData { outputs = root.outputs };
            List<ObsOutput> outputs = responseData.outputs;

            if (outputs != null)
            {
                foreach (ObsOutput output in outputs)
                {
                    if (output == null || output.outputActive != true) continue;
                    string outputName = Bounded(output.outputName, 200);
                    string outputKind = Bounded(output.outputKind, 100).ToLowerInvariant();
                    string lowerName = outputName.ToLowerInvariant();
                    // Aitum Vertical is stopped through its supported vendor request below. Do
                    // not count a generic StopOutput rejection as a failure when that dedicated
                    // control remains available.
                    if (lowerName.StartsWith("vertical_canvas_stream_")) continue;

                    // Aitum creates outputs with the stable aitum_multi_output_ prefix. Current
                    // obs-websocket output records do not guarantee outputFlags, so also recognize
                    // every transport kind Aitum itself can create (RTMP, WHIP, FTL, and MPEG-TS).
                    bool isStreamingOutput = HasOutputServiceFlag(output.outputFlags)
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
                        string request = JsonConvert.SerializeObject(new Dictionary<string, string> { { "outputName", outputName } });
                        string stopResponse = CPH.ObsSendRaw("StopOutput", request);
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

        // Aitum Vertical owns a dedicated obs-websocket vendor request. In OBS 32 its active
        // output can be absent from GetOutputList even while YouTube Vertical is still live, so
        // the generic StopOutput pass above is not sufficient on its own. Ask the plug-in to stop
        // every configured Vertical Canvas stream before main OBS goes offline. A missing/older
        // Aitum plug-in is non-fatal and cannot hold the main stream online.
        try
        {
            string request = JsonConvert.SerializeObject(new
            {
                vendorName = "aitum-vertical-canvas",
                requestType = "stop_streaming",
                requestData = new { }
            });
            string response = CPH.ObsSendRaw("CallVendorRequest", request);
            EnsureRequestSucceeded(response, "Aitum Vertical stop_streaming");
            verticalStopRequested = true;
            CPH.LogInfo("THSV Raid Scout asked Aitum Vertical to stop every Vertical Canvas stream.");
            Thread.Sleep(500);
        }
        catch (Exception error)
        {
            CPH.LogWarn("THSV Raid Scout could not dispatch the Aitum Vertical stop request; continuing with OBS main: " + Bounded(error.Message, 240));
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
        CPH.SetArgument("raidScoutVerticalStopRequested", verticalStopRequested);
        return failedPluginOutputs == 0;
    }

    private bool WaitForOutputToStopUntil(string outputName, int deadline)
    {
        string request = JsonConvert.SerializeObject(new Dictionary<string, string> { { "outputName", outputName } });
        while (unchecked(Environment.TickCount - deadline) < 0)
        {
            try
            {
                string response = CPH.ObsSendRaw("GetOutputStatus", request);
                ObsResponse root = JsonConvert.DeserializeObject<ObsResponse>(String.IsNullOrWhiteSpace(response) ? "{}" : response) ?? new ObsResponse();
                // An output removed during shutdown is no longer active and therefore counts as
                // stopped even if OBS reports that its name can no longer be found.
                if (root.requestStatus != null && root.requestStatus.result == false) return true;
                ObsResponseData responseData = root.responseData ?? new ObsResponseData { outputActive = root.outputActive };
                if (responseData.outputActive != true) return true;
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
        ObsResponse root = JsonConvert.DeserializeObject<ObsResponse>(response) ?? new ObsResponse();
        if (root.requestStatus == null || root.requestStatus.result != false) return;
        string comment = Bounded(root.requestStatus.comment, 240);
        throw new InvalidOperationException(requestName + " was rejected by OBS" + (comment.Length == 0 ? "." : ": " + comment));
    }

    private string Bounded(string value, int maximum)
    {
        string clean = (value ?? "").Replace("\r", " ").Replace("\n", " ").Trim();
        return clean.Length <= maximum ? clean : clean.Substring(0, maximum);
    }

    private bool HasOutputServiceFlag(object value)
    {
        if (value == null) return false;
        try
        {
            long numeric = Convert.ToInt64(value);
            return (numeric & ObsOutputServiceFlag) != 0;
        }
        catch
        {
            // OBS 32/obs-websocket exposes outputFlags as a named boolean object instead of the
            // earlier integer bitmask. Read it without JToken casts so Streamer.bot's bundled
            // Newtonsoft version cannot fail on the new response shape.
            string encoded = JsonConvert.SerializeObject(value);
            return encoded.IndexOf("\"OBS_OUTPUT_SERVICE\":true", StringComparison.OrdinalIgnoreCase) >= 0;
        }
    }

    private sealed class ObsResponse
    {
        public ObsRequestStatus requestStatus { get; set; }
        public ObsResponseData responseData { get; set; }
        public List<ObsOutput> outputs { get; set; }
        public bool? outputActive { get; set; }
    }

    private sealed class ObsRequestStatus
    {
        public bool result { get; set; }
        public string comment { get; set; }
    }

    private sealed class ObsResponseData
    {
        public List<ObsOutput> outputs { get; set; }
        public bool? outputActive { get; set; }
    }

    private sealed class ObsOutput
    {
        public string outputName { get; set; }
        public string outputKind { get; set; }
        public object outputFlags { get; set; }
        public bool outputActive { get; set; }
    }
}
