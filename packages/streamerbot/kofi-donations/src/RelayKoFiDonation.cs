// Purpose: Relays one Ko-fi Donation trigger to the Ko-fi Donations add-on using Ko-fi's stable messageId.
// Privacy: Private names and messages are relayed locally but are suppressed by the add-on before public output.
// References: mscorlib.dll, System.dll, and Streamer.bot's bundled .\Newtonsoft.Json.dll.
using System;
using System.Globalization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

public class CPHInline
{
    private const string ModuleId = "thsv.kofi-donations";
    private const int MaximumTextLength = 2000;

    public bool Execute()
    {
        if (CPH.GetEventType().ToString() != "KofiDonation") return Fail("Attach only Ko-Fi > Donation to this action.");
        string messageId = Read("messageId", 256); string amount = ReadDecimal("amount"); string currency = Read("currency", 8).ToUpperInvariant();
        if (String.IsNullOrWhiteSpace(messageId)) return Fail("Ko-fi did not provide its stable messageId; the payment was rejected safely.");
        if (String.IsNullOrWhiteSpace(amount) || currency.Length != 3) return Fail("Ko-fi amount or currency was missing or invalid.");
        var envelope = new JObject {
            ["type"] = "thsv.addon", ["version"] = "1.0.0", ["moduleId"] = ModuleId,
            ["eventType"] = "addon.thsv.kofi-donations.donation-received", ["sourceEventType"] = "KofiDonation", ["relayId"] = messageId, ["relayToken"] = "",
            ["receivedAt"] = DateTimeOffset.UtcNow.ToString("O"), ["simulated"] = ReadBoolean("isTest") || ReadBoolean("isSimulated"),
            ["payload"] = new JObject { ["amount"] = amount, ["currency"] = currency, ["from"] = Read("from", 256), ["isPublic"] = ReadBoolean("isPublic"), ["message"] = Read("message", MaximumTextLength), ["timestamp"] = ReadTimestamp("timestamp") }
        };
        try { CPH.WebsocketBroadcastJson(envelope.ToString(Formatting.None)); }
        catch (Exception error) { CPH.LogError("THSV Ko-fi relay failed (" + error.GetType().Name + ")."); return Fail("The Ko-fi payment could not be relayed locally."); }
        CPH.SetArgument("kofiDonationRelayValid", true); CPH.SetArgument("kofiDonationRelayError", ""); CPH.SetArgument("kofiDonationMessageId", messageId); return true;
    }
    private string Read(string name, int maximum) { object value; string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value, CultureInfo.InvariantCulture) ?? "" : ""; text = text.Replace("\r", " ").Replace("\n", " ").Replace("\0", " ").Trim(); return text.Length <= maximum ? text : text.Substring(0, maximum); }
    private string ReadDecimal(string name) { object value; if (!CPH.TryGetArg(name, out value) || value == null) return ""; decimal parsed; if (!Decimal.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), NumberStyles.Number, CultureInfo.InvariantCulture, out parsed) || parsed < 0) return ""; return parsed.ToString("0.######", CultureInfo.InvariantCulture); }
    private bool ReadBoolean(string name) { object value; bool parsed; return CPH.TryGetArg(name, out value) && value != null && Boolean.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out parsed) && parsed; }
    private string ReadTimestamp(string name) { object value; if (!CPH.TryGetArg(name, out value) || value == null) return DateTimeOffset.UtcNow.ToString("O"); if (value is DateTimeOffset) return ((DateTimeOffset)value).ToUniversalTime().ToString("O"); if (value is DateTime) return new DateTimeOffset(((DateTime)value).ToUniversalTime()).ToString("O"); DateTimeOffset parsed; return DateTimeOffset.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out parsed) ? parsed.ToUniversalTime().ToString("O") : DateTimeOffset.UtcNow.ToString("O"); }
    private bool Fail(string message) { CPH.SetArgument("kofiDonationRelayValid", false); CPH.SetArgument("kofiDonationRelayError", message); CPH.LogWarn("THSV Ko-fi: " + message); return false; }
}
