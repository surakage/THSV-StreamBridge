// Purpose: Performs one creator-approved native Twitch shoutout requested by the Automated
// Shoutouts add-on. StreamBridge owns trigger selection, queueing, and cooldown reservation;
// this action is only the narrow Twitch API boundary.
// References: mscorlib.dll and System.dll (standard .NET Framework references bundled with Windows).
using System;

public class CPHInline
{
    private const string PackageVersion = "1.0.0";

    public bool Execute()
    {
        InitializeOutputs();
        string relayToken = ReadArgument("thsvAddonRelayToken");
        if (String.IsNullOrWhiteSpace(relayToken)) return Fail("StreamBridge did not dispatch this add-on action.");

        bool simulated;
        if (CPH.TryGetArg("simulated", out simulated) && simulated) return Fail("Simulated shoutouts cannot call the Twitch API.");

        string userId = Bounded(ReadArgument("targetUserId"), 256);
        string userName = Bounded(ReadArgument("targetUserName").TrimStart('@'), 256);
        if (String.IsNullOrWhiteSpace(userId) && String.IsNullOrWhiteSpace(userName)) return Fail("A Twitch user ID or login is required.");

        bool success;
        try
        {
            // Stable IDs survive user renames, so prefer the documented ID overload when present.
            success = !String.IsNullOrWhiteSpace(userId)
                ? CPH.TwitchSendShoutoutById(userId)
                : CPH.TwitchSendShoutoutByLogin(userName);
        }
        catch (Exception exception)
        {
            return Fail("Twitch rejected the shoutout (" + exception.GetType().Name + ").");
        }

        CPH.SetArgument("automatedShoutoutHandled", true);
        CPH.SetArgument("automatedShoutoutSucceeded", success);
        if (!success) return Fail("Twitch did not accept the shoutout. Confirm the channel is live and the native cooldown has elapsed.");
        return true;
    }

    private void InitializeOutputs()
    {
        CPH.SetArgument("automatedShoutoutHandled", false);
        CPH.SetArgument("automatedShoutoutSucceeded", false);
        CPH.SetArgument("automatedShoutoutError", "");
        CPH.SetArgument("automatedShoutoutPackageVersion", PackageVersion);
    }

    private string ReadArgument(string name)
    {
        object value;
        return CPH.TryGetArg(name, out value) && value != null ? value.ToString().Trim() : "";
    }

    private string Bounded(string value, int maximumLength)
    {
        if (String.IsNullOrEmpty(value)) return "";
        return value.Length > maximumLength ? value.Substring(0, maximumLength) : value;
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("automatedShoutoutError", reason);
        CPH.LogWarn("THSV Automated Shoutouts: " + reason);
        return false;
    }
}
