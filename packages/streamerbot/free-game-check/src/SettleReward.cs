// Purpose: Fulfills or refunds one exact Twitch Free Game Check redemption.
// Keep triggerless. Reward and redemption IDs arrive only through a one-use broker-authorized request.
// References: mscorlib.dll, System.dll, System.Core.dll, and netstandard.dll.
using System;

public class CPHInline
{
    public bool Execute()
    {
        string operation = Read("freeGameRewardOperation", 20);
        string rewardId = Read("freeGameRewardId", 256);
        string redemptionId = Read("freeGameRedemptionId", 256);
        string token = Read("thsvAddonRelayToken", 100);
        if (token.Length < 20 || rewardId.Length == 0 || redemptionId.Length == 0 || (operation != "fulfill" && operation != "refund"))
            return Fail("The reward settlement request was invalid.");

        bool success = false;
        try
        {
            success = operation == "fulfill"
                ? CPH.TwitchRedemptionFulfill(rewardId, redemptionId)
                : CPH.TwitchRedemptionCancel(rewardId, redemptionId);
        }
        catch (Exception error)
        {
            CPH.LogWarn("THSV Free Game Check reward settlement failed (" + error.GetType().Name + ").");
        }

        CPH.SetArgument("freeGameRewardSuccess", success);
        CPH.SetArgument("freeGameRewardOperation", operation);
        return success;
    }

    private string Read(string key, int max)
    {
        object value;
        string text = CPH.TryGetArg(key, out value) && value != null ? Convert.ToString(value).Trim() : "";
        return text.Length <= max ? text : text.Substring(0, max);
    }

    private bool Fail(string reason)
    {
        CPH.SetArgument("freeGameRewardSuccess", false);
        CPH.SetArgument("freeGameRewardError", reason);
        CPH.LogWarn("THSV Free Game Check: " + reason);
        return false;
    }
}
