// Purpose: Performs one explicitly approved Twitch reward or redemption administration operation.
// Trust boundary: validates platform, operation, and bounded IDs; unsupported Kick mutations fail closed.
// References: mscorlib.dll and System.dll; no third-party compiler references are required.
using System;

public class CPHInline
{
    private const string ContractVersion = "1.0.0";
    public bool Execute()
    {
        // Initialize deterministic outputs before checking the creator-approval gate.
        Set("rewardAdminHandled", false); Set("rewardAdminValid", false); Set("rewardAdminDispatched", false); Set("rewardAdminValidationError", ""); Set("rewardAdminContractVersion", ContractVersion);
        string platform = Read("rewardAdminPlatform").ToLowerInvariant();
        string operation = Read("rewardAdminOperation").ToLowerInvariant();
        string rewardId = Read("rewardAdminRewardId");
        string redemptionId = Read("rewardAdminRedemptionId");
        Set("rewardAdminHandled", true);
        if (!Approved()) return Fail("Reward administration requires explicit creator approval.");
        if (platform != "twitch") return Fail("Kick reward mutations are unavailable because Streamer.bot has not documented them.");
        if (operation != "enable" && operation != "disable" && operation != "pause" && operation != "unpause" && operation != "fulfill" && operation != "cancel") return Fail("Unsupported Twitch reward operation.");
        if (rewardId.Length == 0 || rewardId.Length > 256) return Fail("A bounded Twitch reward ID is required.");
        if ((operation == "fulfill" || operation == "cancel") && (redemptionId.Length == 0 || redemptionId.Length > 256)) return Fail("Redemption operations require a bounded redemption ID.");
        try
        {
            // These six CPH calls compiled successfully in a live Streamer.bot v1.0.5-alpha.31
            // instance. Their live state-changing behavior was deliberately not exercised; use
            // only a harmless custom reward when completing creator acceptance testing.
            bool dispatched = true;
            if (operation == "enable") CPH.EnableReward(rewardId);
            else if (operation == "disable") CPH.DisableReward(rewardId);
            else if (operation == "pause") CPH.PauseReward(rewardId);
            else if (operation == "unpause") CPH.UnPauseReward(rewardId);
            else if (operation == "fulfill") dispatched = CPH.TwitchRedemptionFulfill(rewardId, redemptionId);
            else if (operation == "cancel") dispatched = CPH.TwitchRedemptionCancel(rewardId, redemptionId);
            Set("rewardAdminDispatched", dispatched);
            if (!dispatched) return Fail("Streamer.bot reported that the reward operation was not completed.");
        }
        catch (Exception error) { CPH.LogError("THSV Reward Administration dispatch failed (" + error.GetType().Name + ")."); return Fail("Reward administration dispatch failed."); }
        Set("rewardAdminValid", true); Set("rewardAdminOperationResult", operation); Set("rewardAdminRewardIdResult", rewardId); return true;
    }
    private string Read(string name) { string value; return CPH.TryGetArg(name, out value) && value != null ? value.Trim() : ""; }
    private bool Approved() { bool value; return CPH.TryGetArg("rewardAdminApproved", out value) && value; }
    private void Set(string name, object value) { CPH.SetArgument(name, value); }
    private bool Fail(string message) { Set("rewardAdminValidationError", message); CPH.LogError("THSV Reward Administration rejected a request: " + message); return false; }
}
