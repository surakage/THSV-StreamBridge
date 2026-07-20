// Purpose: Performs creator-approved enable or disable operations on one known Streamer.bot command.
// Trust boundary: validates approval, operation, and command UUID before calling a mutation method.
// References: mscorlib.dll and System.dll; no third-party compiler references are required.
using System;

public class CPHInline
{
    private const string ContractVersion = "1.0.0";
    private const string PackageVersion = "1.0.0";
    private const int MaximumCommandIdLength = 128;

    public bool Execute()
    {
        // Initialize every result so downstream actions never inherit stale values.
        InitializeOutputs();
        string operation = ReadString("commandAdminOperation").ToLowerInvariant();
        if (operation != "enable" && operation != "disable")
            return Fail("commandAdminOperation must be enable or disable.");
        CPH.SetArgument("commandAdminHandled", true);

        if (!ReadBoolean("commandAdminApproved"))
            return Fail("Command administration operations require explicit creator approval.");

        string commandId = ReadString("commandAdminCommandId");
        Guid parsedCommandId;
        if (commandId.Length == 0 || commandId.Length > MaximumCommandIdLength || !Guid.TryParse(commandId, out parsedCommandId))
            return Fail("commandAdminCommandId must be a valid Streamer.bot command GUID.");

        string requestId = ReadString("commandAdminRequestId");
        if (requestId.Length == 0) requestId = Guid.NewGuid().ToString("N");
        if (requestId.Length > 128) return Fail("commandAdminRequestId exceeds the bounded request identifier length.");

        CPH.SetArgument("commandAdminRequestId", requestId);
        CPH.SetArgument("commandAdminOperationResult", operation);
        CPH.SetArgument("commandAdminCommandIdResult", commandId);

        try
        {
            // CPH.EnableCommand/DisableCommand are documented at
            // https://docs.streamer.bot/api/csharp/methods/core/commands as C# methods, not as
            // a standalone WebSocket request, which is why this dispatch must happen inside a
            // Streamer.bot action rather than directly from the bridge. Confirmed live against a
            // real Streamer.bot v1.0.5-alpha.31 command: this exact overload, called with the
            // Streamer.bot-assigned command ID (not the command name), both enables and disables
            // correctly - see docs/stage-5-plan.md.
            if (operation == "enable") CPH.EnableCommand(commandId);
            else CPH.DisableCommand(commandId);
            CPH.SetArgument("commandAdminDispatched", true);
        }
        catch (Exception error)
        {
            CPH.LogError("THSV Command Administration dispatch failed (" + error.GetType().Name + ").");
            return Fail("Command administration dispatch failed.");
        }

        CPH.SetArgument("commandAdminValid", true);
        return true;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("commandAdminHandled", false);
        CPH.SetArgument("commandAdminValid", false);
        CPH.SetArgument("commandAdminValidationError", string.Empty);
        CPH.SetArgument("commandAdminContractVersion", ContractVersion);
        CPH.SetArgument("commandAdminPackageVersion", PackageVersion);
        CPH.SetArgument("commandAdminRequestId", string.Empty);
        CPH.SetArgument("commandAdminOperationResult", string.Empty);
        CPH.SetArgument("commandAdminCommandIdResult", string.Empty);
        CPH.SetArgument("commandAdminDispatched", false);
    }

    private bool Fail(string message)
    {
        CPH.SetArgument("commandAdminValidationError", message);
        CPH.LogError("THSV Command Administration rejected a request: " + message);
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
}
