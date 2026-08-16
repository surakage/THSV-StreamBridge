// Purpose: Creator-only broadcast test helper. Starts OBS main plus configured Aitum Multistream
// and Aitum Vertical streaming outputs. Recording, replay-buffer, virtual-camera, and unrelated
// service outputs are never targeted. Keep this action triggerless until the creator deliberately
// attaches it to a protected Stream Deck button or hotkey.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot's bundled Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using System.Threading;
using Newtonsoft.Json;

public class CPHInline
{
    public bool Execute()
    {
        bool dryRun = CPH.TryGetArg("thsvGoLiveTestDryRun", out bool requestedDryRun) && requestedDryRun;
        int discoveredPluginOutputs = 0;
        int startedPluginOutputs = 0;
        int alreadyActivePluginOutputs = 0;
        int failedPluginOutputs = 0;
        bool mainStarted = false;
        bool mainAlreadyActive = false;
        string mainError = "";

        // Start OBS main first so its normal Streaming Started trigger remains the authoritative
        // go-live signal. A plug-in failure below never rolls the healthy main broadcast back.
        try
        {
            if (CPH.ObsIsStreaming()) mainAlreadyActive = true;
            else if (dryRun) CPH.LogInfo("THSV OBS/Aitum go-live test dry run found OBS main offline; a live run would start it.");
            else
            {
                CPH.ObsStartStreaming();
                mainStarted = true;
            }
        }
        catch (Exception error)
        {
            mainError = Bounded(error.Message, 300);
            CPH.LogError("THSV OBS/Aitum go-live test could not start OBS main: " + mainError);
        }

        var requestedPluginOutputs = new List<string>();
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
                    if (output == null) continue;
                    string outputName = Bounded(output.outputName, 200);
                    string lowerName = outputName.ToLowerInvariant();
                    bool isAitumOutput = lowerName.StartsWith("aitum_multi_output_")
                        || lowerName.StartsWith("vertical_canvas_stream_");
                    if (!isAitumOutput || outputName.Length == 0) continue;
                    discoveredPluginOutputs++;

                    if (output.outputActive)
                    {
                        alreadyActivePluginOutputs++;
                        CPH.LogInfo("THSV OBS/Aitum go-live test found output '" + outputName + "' already active.");
                        continue;
                    }

                    if (dryRun)
                    {
                        CPH.LogInfo("THSV OBS/Aitum go-live test dry run found inactive output '" + outputName + "'; a live run would start it.");
                        continue;
                    }

                    try
                    {
                        string request = JsonConvert.SerializeObject(new Dictionary<string, string> { { "outputName", outputName } });
                        string startResponse = CPH.ObsSendRaw("StartOutput", request);
                        EnsureRequestSucceeded(startResponse, "StartOutput");
                        requestedPluginOutputs.Add(outputName);
                    }
                    catch (Exception error)
                    {
                        failedPluginOutputs++;
                        CPH.LogWarn("THSV OBS/Aitum go-live test could not start output '" + outputName + "': " + error.Message);
                    }
                }

                int confirmationDeadline = Environment.TickCount + 5000;
                foreach (string outputName in requestedPluginOutputs)
                {
                    if (WaitForOutputToStartUntil(outputName, confirmationDeadline))
                    {
                        startedPluginOutputs++;
                        CPH.LogInfo("THSV OBS/Aitum go-live test confirmed output '" + outputName + "' active.");
                    }
                    else
                    {
                        failedPluginOutputs++;
                        CPH.LogWarn("THSV OBS/Aitum go-live test could not confirm output '" + outputName + "' active before the timeout.");
                    }
                }
            }
        }
        catch (Exception error)
        {
            failedPluginOutputs++;
            CPH.LogWarn("THSV OBS/Aitum go-live test could not inspect OBS outputs: " + error.Message);
        }

        bool success = mainError.Length == 0 && failedPluginOutputs == 0;
        CPH.SetArgument("thsvGoLiveTestSuccess", success);
        CPH.SetArgument("thsvGoLiveTestDryRun", dryRun);
        CPH.SetArgument("thsvGoLiveTestDiscoveredAitumOutputs", discoveredPluginOutputs);
        CPH.SetArgument("thsvGoLiveTestMainStarted", mainStarted);
        CPH.SetArgument("thsvGoLiveTestMainAlreadyActive", mainAlreadyActive);
        CPH.SetArgument("thsvGoLiveTestMainError", mainError);
        CPH.SetArgument("thsvGoLiveTestStartedAitumOutputs", startedPluginOutputs);
        CPH.SetArgument("thsvGoLiveTestAlreadyActiveAitumOutputs", alreadyActivePluginOutputs);
        CPH.SetArgument("thsvGoLiveTestFailedAitumOutputs", failedPluginOutputs);

        if (success && dryRun)
            CPH.LogInfo("THSV OBS/Aitum go-live test dry run completed without starting a broadcast; discovered " + discoveredPluginOutputs + " Aitum output(s).");
        else if (success)
            CPH.LogInfo("THSV OBS/Aitum go-live test completed: OBS main and every discovered Aitum output are active.");
        return success;
    }

    private bool WaitForOutputToStartUntil(string outputName, int deadline)
    {
        string request = JsonConvert.SerializeObject(new Dictionary<string, string> { { "outputName", outputName } });
        while (unchecked(Environment.TickCount - deadline) < 0)
        {
            try
            {
                string response = CPH.ObsSendRaw("GetOutputStatus", request);
                ObsResponse root = JsonConvert.DeserializeObject<ObsResponse>(String.IsNullOrWhiteSpace(response) ? "{}" : response) ?? new ObsResponse();
                if (root.requestStatus != null && root.requestStatus.result == false) return false;
                ObsResponseData responseData = root.responseData ?? new ObsResponseData { outputActive = root.outputActive };
                if (responseData.outputActive == true) return true;
            }
            catch (Exception error)
            {
                CPH.LogWarn("THSV OBS/Aitum go-live test could not inspect output '" + outputName + "': " + error.Message);
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
        public bool outputActive { get; set; }
    }
}
