// Purpose: Fulfills or refunds one exact Twitch Viewer Spotlight redemption.
// Keep triggerless. Reward and redemption IDs are supplied through a one-use broker-authorized request.
// References: mscorlib.dll, System.dll, System.Core.dll, and netstandard.dll.
using System;
public class CPHInline
{
    public bool Execute()
    {
        string operation = Read("viewerSpotlightRewardOperation", 20), rewardId = Read("viewerSpotlightRewardId", 256), redemptionId = Read("viewerSpotlightRedemptionId", 256), token = Read("thsvAddonRelayToken", 100);
        if (token.Length < 20 || rewardId.Length == 0 || redemptionId.Length == 0 || (operation != "fulfill" && operation != "refund")) return Fail("The reward settlement request was invalid.");
        bool success = false; try { success = operation == "fulfill" ? CPH.TwitchRedemptionFulfill(rewardId, redemptionId) : CPH.TwitchRedemptionCancel(rewardId, redemptionId); } catch (Exception error) { CPH.LogWarn("THSV Viewer Spotlight reward settlement failed (" + error.GetType().Name + ")."); }
        CPH.SetArgument("viewerSpotlightRewardSuccess", success); CPH.SetArgument("viewerSpotlightRewardOperation", operation); return success;
    }
    private string Read(string key, int max) { object value; string text = CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : ""; return text.Length <= max ? text : text.Substring(0, max); }
    private bool Fail(string reason) { CPH.SetArgument("viewerSpotlightRewardSuccess", false); CPH.SetArgument("viewerSpotlightRewardError", reason); CPH.LogWarn("THSV Viewer Spotlight: " + reason); return false; }
}
