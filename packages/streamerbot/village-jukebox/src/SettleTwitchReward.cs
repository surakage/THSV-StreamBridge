// Purpose: Fulfills or refunds one broker-approved Twitch Village Jukebox redemption.
// References: mscorlib.dll, System.dll, and netstandard.dll.
using System;

public class CPHInline
{
    public bool Execute()
    {
        string operation = Read("villageJukeboxRewardOperation", 20).ToLowerInvariant();
        string rewardId = Read("villageJukeboxRewardId", 256), redemptionId = Read("villageJukeboxRedemptionId", 256);
        if ((operation != "fulfill" && operation != "refund") || String.IsNullOrWhiteSpace(rewardId) || String.IsNullOrWhiteSpace(redemptionId)) return Fail("A valid operation, reward ID, and redemption ID are required.");
        bool success;
        try { success = operation == "fulfill" ? CPH.TwitchRedemptionFulfill(rewardId, redemptionId) : CPH.TwitchRedemptionCancel(rewardId, redemptionId); }
        catch (Exception exception) { return Fail("Twitch reward settlement failed (" + exception.GetType().Name + ")."); }
        CPH.SetArgument("villageJukeboxRewardSettlementSuccess", success);
        if (!success) CPH.LogWarn("THSV Village Jukebox could not " + operation + " the Twitch redemption. Review the reward ownership and stable IDs.");
        return success;
    }
    private string Read(string name, int maximum) { object value; string text = CPH.TryGetArg(name, out value) && value != null ? Convert.ToString(value) ?? "" : ""; text = text.Trim(); return text.Length <= maximum ? text : text.Substring(0, maximum); }
    private bool Fail(string message) { CPH.SetArgument("villageJukeboxRewardSettlementSuccess", false); CPH.LogWarn("THSV Village Jukebox: " + message); return false; }
}
