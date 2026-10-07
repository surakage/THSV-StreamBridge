// Purpose: Relays recognized speech from native Voice Control Dictation and Log triggers to
// StreamBridge as a versioned thsv.caption envelope. No file I/O or transcript logging.
// References: mscorlib.dll, System.dll, netstandard.dll, and Streamer.bot/Newtonsoft.Json.dll.
// Triggers: attach Voice Control > Dictation and/or Voice Control > Log to this one action.
using System;
using System.Globalization;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private static bool reportedMissingArguments;
    private string Read(params string[] names)
    {
        foreach (string name in names) { object value; if (CPH.TryGetArg(name, out value) && value != null && !String.IsNullOrWhiteSpace(value.ToString())) return value.ToString(); }
        return "";
    }
    public bool Execute()
    {
        string text = Read("spokenText", "spokenTextInput", "text");
        string confidenceText = Read("spokenTextConfidence", "confidence", "spokenTextConfidencePercent");
        string log = Read("log", "logText", "message", "logMessage");
        if (String.IsNullOrWhiteSpace(text)) {
            Match match = Regex.Match(log, @"Spoken Dictation\s*\((?<confidence>[0-9]+(?:\.[0-9]+)?)%\):\s*(?<text>.+)", RegexOptions.IgnoreCase);
            if (match.Success) { text = match.Groups["text"].Value; confidenceText = match.Groups["confidence"].Value; }
        }
        if (String.IsNullOrWhiteSpace(text)) {
            if (!reportedMissingArguments) { reportedMissingArguments = true; CPH.LogWarn("Closed Captions relay: no spokenText, text, or Spoken Dictation log argument was supplied."); }
            return false;
        }
        double confidence;
        if (!Double.TryParse(confidenceText, NumberStyles.Float, CultureInfo.InvariantCulture, out confidence)) confidence = 0.5;
        if (Double.IsNaN(confidence) || Double.IsInfinity(confidence)) return false;
        if (confidence > 1) confidence /= 100;
        confidence = Math.Max(0, Math.Min(1, confidence));
        text = text.Trim(); if (text.Length > 2000) text = text.Substring(0, 2000);
        var payload = new JObject { ["type"] = "thsv.caption", ["version"] = "1.0.0", ["payload"] = new JObject { ["text"] = text, ["confidence"] = confidence } };
        CPH.WebsocketBroadcastJson(payload.ToString(Newtonsoft.Json.Formatting.None));
        return true;
    }
}
