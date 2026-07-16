using System;
using Newtonsoft.Json;

public class CPHInline
{
    private const string ContractVersion = "1.0.0";
    private const string PackageVersion = "1.0.1";
    private const int SpeakerBotUdpPort = 6669;
    private const int MaximumMessageLength = 500;
    private const int MaximumVoiceAliasLength = 100;

    public bool Execute()
    {
        InitializeOutputs();
        string operation = ReadString("speakerOperation").ToLowerInvariant();
        if (!IsOperation(operation)) return Fail("speakerOperation must be speak, stop, pause, resume, or clear.");
        CPH.SetArgument("speakerHandled", true);
        if (!ReadBoolean("speakerApproved")) return Fail("Speaker.bot operations require explicit creator approval.");

        bool simulated = ReadBoolean("speakerSimulated") || ReadBoolean("streamBridgeSimulated") || ReadBoolean("multiAlertSimulated");
        bool allowSimulated = ReadBoolean("speakerAllowSimulated");
        bool dryRun = ReadBoolean("speakerDryRun");
        if (simulated && !allowSimulated) return Fail("Simulated events are denied unless speakerAllowSimulated is explicitly enabled.");

        string requestId = ReadString("speakerRequestId");
        if (requestId.Length == 0) requestId = Guid.NewGuid().ToString("N");
        if (!IsRequestId(requestId)) return Fail("speakerRequestId must be a bounded identifier.");

        string voiceAlias = string.Empty;
        string message = string.Empty;
        string textSource = string.Empty;
        string transport;
        if (operation == "speak")
        {
            textSource = ReadString("speakerTextSource").ToLowerInvariant();
            if (textSource != "creator-template" && textSource != "creator-approved")
                return Fail("Speech text must come from a creator template or an explicitly creator-approved source; raw-event is denied.");
            voiceAlias = NormalizePlainText(ReadString("speakerVoiceAlias"));
            message = NormalizePlainText(ReadString("speakerMessage"));
            if (voiceAlias.Length == 0 || voiceAlias.Length > MaximumVoiceAliasLength) return Fail("speakerVoiceAlias must contain at most 100 plain-text characters.");
            if (message.Length == 0 || message.Length > MaximumMessageLength) return Fail("speakerMessage must contain at most 500 plain-text characters.");
            transport = "speakerbot-cph";
        }
        else
        {
            if (ReadString("speakerVoiceAlias").Length > 0 || ReadString("speakerMessage").Length > 0 || ReadString("speakerTextSource").Length > 0)
                return Fail(operation + " does not accept speech text or a voice alias.");
            transport = "speakerbot-udp";
        }

        CPH.SetArgument("speakerRequestId", requestId);
        CPH.SetArgument("speakerOperationResult", operation);
        CPH.SetArgument("speakerTransport", transport);
        CPH.SetArgument("speakerDryRunResult", dryRun);
        CPH.SetArgument("speakerSimulatedResult", simulated);
        CPH.SetArgument("speakerBadWordFilter", true);
        CPH.SetArgument("speakerVoiceAliasResult", voiceAlias);
        CPH.SetArgument("speakerMessageResult", message);
        CPH.SetArgument("speakerTextSourceResult", textSource);

        if (!dryRun)
        {
            try
            {
                int result = operation == "speak"
                    ? CPH.TtsSpeak(voiceAlias, message, true)
                    : CPH.BroadcastUdp(SpeakerBotUdpPort, JsonConvert.SerializeObject(new { command = operation, id = requestId }));
                CPH.SetArgument("speakerDispatchResult", result);
                if (result <= 0) return Fail("Speaker.bot transport returned a non-positive dispatch result.");
                CPH.SetArgument("speakerDispatched", true);
            }
            catch (Exception error)
            {
                return Fail("Speaker.bot dispatch failed: " + error.Message);
            }
        }

        CPH.SetArgument("speakerValid", true);
        return true;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("speakerHandled", false);
        CPH.SetArgument("speakerValid", false);
        CPH.SetArgument("speakerValidationError", string.Empty);
        CPH.SetArgument("speakerContractVersion", ContractVersion);
        CPH.SetArgument("speakerPackageVersion", PackageVersion);
        CPH.SetArgument("speakerRequestId", string.Empty);
        CPH.SetArgument("speakerOperationResult", string.Empty);
        CPH.SetArgument("speakerTransport", string.Empty);
        CPH.SetArgument("speakerDispatched", false);
        CPH.SetArgument("speakerDryRunResult", false);
        CPH.SetArgument("speakerSimulatedResult", false);
        CPH.SetArgument("speakerBadWordFilter", true);
        CPH.SetArgument("speakerVoiceAliasResult", string.Empty);
        CPH.SetArgument("speakerMessageResult", string.Empty);
        CPH.SetArgument("speakerTextSourceResult", string.Empty);
        CPH.SetArgument("speakerDispatchResult", -1);
        CPH.SetArgument("speakerGeneratedMetadataAvailable", false);
        CPH.SetArgument("speakerDurationMs", -1);
        CPH.SetArgument("speakerAudioFile", string.Empty);
    }

    private bool Fail(string message)
    {
        CPH.SetArgument("speakerValidationError", message);
        CPH.LogError("THSV Speaker Orchestration rejected a request: " + message);
        return false;
    }

    private string ReadString(string name)
    {
        string value;
        return CPH.TryGetArg(name, out value) && value != null ? value.Trim() : string.Empty;
    }

    private bool ReadBoolean(string name)
    {
        bool value;
        return CPH.TryGetArg(name, out value) && value;
    }

    private bool IsOperation(string operation)
    {
        return operation == "speak" || operation == "stop" || operation == "pause" || operation == "resume" || operation == "clear";
    }

    private string NormalizePlainText(string input)
    {
        string value = input ?? string.Empty;
        char[] normalized = new char[value.Length];
        int length = 0;
        bool pendingSpace = false;
        foreach (char character in value)
        {
            if (char.IsControl(character) || char.IsWhiteSpace(character))
            {
                pendingSpace = length > 0;
                continue;
            }
            if (pendingSpace) normalized[length++] = ' ';
            normalized[length++] = character;
            pendingSpace = false;
        }
        return new string(normalized, 0, length);
    }

    private bool IsRequestId(string value)
    {
        if (value.Length == 0 || value.Length > 128 || !IsAsciiAlphaNumeric(value[0])) return false;
        for (int index = 1; index < value.Length; index++)
        {
            char character = value[index];
            if (!IsAsciiAlphaNumeric(character) && character != '.' && character != '_' && character != ':' && character != '-') return false;
        }
        return true;
    }

    private bool IsAsciiAlphaNumeric(char value)
    {
        return value >= 'A' && value <= 'Z' || value >= 'a' && value <= 'z' || value >= '0' && value <= '9';
    }
}
