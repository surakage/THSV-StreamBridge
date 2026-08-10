// Purpose: Reports StreamBridge connection health through a grouped Streamer.bot toast.
// Set thsvBridgeHealthForceToast=true for a manual check. Leave it false for a recurring
// monitor so it only reports a disconnect or a recovery instead of repeating every minute.
// References: mscorlib.dll, System.dll, and System.Core.dll.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;

public class CPHInline
{
    private const string ForceArgument = "thsvBridgeHealthForceToast";
    private const string HealthUrl = "http://127.0.0.1:8787/ready";
    private const string ToastId = "thsv-streambridge-health";
    private const int HealthTimeoutMs = 5_000;
    private static string lastState = String.Empty;

    public bool Execute()
    {
        bool force = false;
        CPH.TryGetArg(ForceArgument, out force);

        string state;
        string message;
        bool healthy = TryReadHealth(out state, out message);
        string previous = lastState;
        lastState = state;
        if (force || !String.Equals(previous, state, StringComparison.Ordinal))
            Notify(healthy ? "THSV StreamBridge - Ready" : "THSV StreamBridge - Attention", message);

        if (healthy)
            CPH.LogInfo("THSV StreamBridge connection check: " + message);
        else
            CPH.LogWarn("THSV StreamBridge connection check: " + message);
        return healthy;
    }

    private bool TryReadHealth(out string state, out string message)
    {
        string body;
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(HealthUrl);
            request.Method = "GET";
            request.Timeout = HealthTimeoutMs;
            request.ReadWriteTimeout = HealthTimeoutMs;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                body = reader.ReadToEnd();
        }
        catch (WebException exception)
        {
            HttpWebResponse response = exception.Response as HttpWebResponse;
            if (response == null)
            {
                state = "offline";
                message = "Status: NOT CONNECTED - StreamBridge is unavailable on 127.0.0.1:8787.";
                return false;
            }
            using (response)
            using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                body = reader.ReadToEnd();
        }
        catch (Exception exception)
        {
            state = "error:" + exception.GetType().Name;
            message = "Status: CHECK FAILED - " + exception.GetType().Name + ". Review the Streamer.bot log.";
            return false;
        }

        if (Regex.IsMatch(body, "\\\"ready\\\"\\s*:\\s*true", RegexOptions.IgnoreCase))
        {
            state = "ready";
            message = "Status: GREEN - bridge, platforms, Streamer.bot delivery, and modules are connected.";
            return true;
        }

        List<string> issues = new List<string>();
        string adapters = Segment(body, "\\\"adapters\\\"", "\\\"outputs\\\"");
        foreach (Match match in Regex.Matches(adapters, "\\\"name\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"[\\s\\S]*?\\\"state\\\"\\s*:\\s*\\\"([^\\\"]+)\\\""))
        {
            string name = match.Groups[1].Value;
            string adapterState = match.Groups[2].Value;
            if (adapterState != "connected" && adapterState != "disabled") issues.Add(name + " " + adapterState);
        }

        string outputs = Segment(body, "\\\"outputs\\\"", "\\\"modules\\\"");
        Match streamerBot = Regex.Match(outputs, "\\\"name\\\"\\s*:\\s*\\\"streamerbot\\\"[\\s\\S]*?\\\"state\\\"\\s*:\\s*\\\"([^\\\"]+)\\\"");
        if (!streamerBot.Success || streamerBot.Groups[1].Value != "connected") issues.Add("Streamer.bot delivery disconnected");
        if (Regex.IsMatch(outputs, "\\\"degraded\\\"\\s*:\\s*true", RegexOptions.IgnoreCase)) issues.Add("delivery degraded");

        string modules = Segment(body, "\\\"modules\\\"", null);
        int unhealthyModules = Regex.Matches(modules, "\\\"status\\\"\\s*:\\s*\\\"(?!healthy\\\")[^\\\"]+\\\"", RegexOptions.IgnoreCase).Count;
        if (unhealthyModules > 0) issues.Add(unhealthyModules + " module(s) unhealthy");
        if (issues.Count == 0) issues.Add("readiness check did not pass");

        state = "attention:" + String.Join("|", issues.ToArray());
        message = "Status: ATTENTION - " + String.Join(", ", issues.ToArray()) + ".";
        return false;
    }

    private static string Segment(string value, string startPattern, string endPattern)
    {
        Match start = Regex.Match(value, startPattern, RegexOptions.IgnoreCase);
        if (!start.Success) return String.Empty;
        int startIndex = start.Index + start.Length;
        if (String.IsNullOrEmpty(endPattern)) return value.Substring(startIndex);
        Match end = Regex.Match(value.Substring(startIndex), endPattern, RegexOptions.IgnoreCase);
        return end.Success ? value.Substring(startIndex, end.Index) : value.Substring(startIndex);
    }

    private void Notify(string title, string message)
    {
        CPH.ShowToastNotification(ToastId, title, message, "THSV StreamBridge", null);
    }
}
