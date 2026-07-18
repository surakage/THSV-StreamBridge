using System;

public class CPHInline
{
    private const string ContractVersion = "1.0.0";
    public bool Execute()
    {
        Set("rewardAdminHandled", false); Set("rewardAdminValid", false); Set("rewardAdminDispatched", false); Set("rewardAdminValidationError", ""); Set("rewardAdminContractVersion", ContractVersion);
        string platform = Read("rewardAdminPlatform").ToLowerInvariant();
        string operation = Read("rewardAdminOperation").ToLowerInvariant();
        string rewardId = Read("rewardAdminRewardId");
        string redemptionId = Read("rewardAdminRedemptionId");
        Set("rewardAdminHandled", true);
        if (!Approved()) return Fail("Reward administration requires explicit creator approval.");
        if (platform != "twitch") return Fail("Kick reward mutations are unavailable because Streamer.bot has not documented them.");
        if (rewardId.Length == 0 || rewardId.Length > 256) return Fail("A bounded Twitch reward ID is required.");
        if ((operation == "fulfill" || operation == "cancel") && (redemptionId.Length == 0 || redemptionId.Length > 256)) return Fail("Redemption operations require a bounded redemption ID.");
        try
        {
            bool dispatched = true;
            if (operation == "enable") CPH.EnableReward(rewardId);
            else if (operation == "disable") CPH.DisableReward(rewardId);
            else if (operation == "pause") CPH.PauseReward(rewardId);
            else if (operation == "unpause") CPH.UnPauseReward(rewardId);
            else if (operation == "fulfill") dispatched = CPH.TwitchRedemptionFulfill(rewardId, redemptionId);
            else if (operation == "cancel") dispatched = CPH.TwitchRedemptionCancel(rewardId, redemptionId);
            else return Fail("Unsupported Twitch reward operation.");
            Set("rewardAdminDispatched", dispatched);
            if (!dispatched) return Fail("Streamer.bot reported that the reward operation was not completed.");
        }
        catch (Exception error) { return Fail("Reward administration dispatch failed: " + error.Message); }
        Set("rewardAdminValid", true); Set("rewardAdminOperationResult", operation); Set("rewardAdminRewardIdResult", rewardId); return true;
    }
    private string Read(string name) { string value; return CPH.TryGetArg(name, out value) && value != null ? value.Trim() : ""; }
    private bool Approved() { bool value; return CPH.TryGetArg("rewardAdminApproved", out value) && value; }
    private void Set(string name, object value) { CPH.SetArgument(name, value); }
    private bool Fail(string message) { Set("rewardAdminValidationError", message); CPH.LogError("THSV Reward Administration rejected a request: " + message); return false; }
}
