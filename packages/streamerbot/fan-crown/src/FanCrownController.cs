// Purpose: Performs one bounded Fan Crown reward operation requested by the installed add-on.
// Keep this action triggerless. The wizard grants its stable ID only to Fan Crown.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using Newtonsoft.Json;

public class CPHInline
{
    private const string ModuleId = "thsv.fan-crown";
    private const string ResultEvent = "addon.thsv.fan-crown.controller-result";
    private const string SourceName = "THSV Addon - Fan Crown - Controller";
    private const int MaximumCost = 2000000000;

    public bool Execute()
    {
        string operation = Read("fanCrownOperation").ToLowerInvariant();
        string requestId = Read("fanCrownRequestId");
        string relayToken = Read("thsvAddonRelayToken");
        if (requestId.Length == 0 || requestId.Length > 100)
            return Reject(operation, requestId, relayToken, "A bounded request ID is required.");
        if (relayToken.Length < 20 || relayToken.Length > 100)
            return Reject(operation, requestId, relayToken, "The one-use add-on relay token is missing.");

        try
        {
            if (operation == "claim") return Claim(requestId, relayToken);
            if (operation == "cancel") return Cancel(requestId, relayToken);
            if (operation == "reset") return Reset(requestId, relayToken);
            return Reject(operation, requestId, relayToken, "Unsupported Fan Crown operation.");
        }
        catch (Exception error)
        {
            CPH.LogError("THSV Fan Crown controller failed (" + error.GetType().Name + ").");
            EmitResult(operation, requestId, relayToken, false, "Streamer.bot could not complete the reward operation.");
            return false;
        }
    }

    private bool Claim(string requestId, string relayToken)
    {
        string rewardId = BoundedId("fanCrownRewardId");
        string redemptionId = BoundedId("fanCrownRedemptionId");
        string rewardTitle = BoundedTitle("fanCrownRewardTitle");
        int rewardCost = BoundedCost("fanCrownRewardCost");
        string previousTitle = BoundedTitle("fanCrownPreviousTitle");
        int previousCost = BoundedCost("fanCrownPreviousCost");
        if (rewardId.Length == 0 || redemptionId.Length == 0 || rewardTitle.Length == 0 || rewardCost == 0 || previousTitle.Length == 0 || previousCost == 0)
            return Reject("claim", requestId, relayToken, "Claim requires bounded reward, redemption, title, cost, and rollback values.");

        // Update title and cost together before the redemption becomes non-refundable.
        bool updated = CPH.UpdateReward(rewardId, rewardTitle, null, rewardCost, null);
        if (!updated)
        {
            CPH.TwitchRedemptionCancel(rewardId, redemptionId);
            return Reject("claim", requestId, relayToken, "Streamer.bot could not update the reward; the redemption was sent for refund.");
        }

        bool fulfilled = CPH.TwitchRedemptionFulfill(rewardId, redemptionId);
        if (!fulfilled)
        {
            bool restored = CPH.UpdateReward(rewardId, previousTitle, null, previousCost, null);
            bool canceled = CPH.TwitchRedemptionCancel(rewardId, redemptionId);
            string recovery = restored && canceled ? "" : " One or more rollback steps need creator review.";
            return Reject("claim", requestId, relayToken, "Streamer.bot could not fulfill the redemption; rollback was requested." + recovery);
        }

        EmitResult("claim", requestId, relayToken, true, "");
        CPH.LogInfo("THSV Fan Crown completed one reward capture.");
        return true;
    }

    private bool Cancel(string requestId, string relayToken)
    {
        string rewardId = BoundedId("fanCrownRewardId");
        string redemptionId = BoundedId("fanCrownRedemptionId");
        if (rewardId.Length == 0 || redemptionId.Length == 0)
            return Reject("cancel", requestId, relayToken, "Cancellation requires reward and redemption IDs.");
        bool canceled = CPH.TwitchRedemptionCancel(rewardId, redemptionId);
        EmitResult("cancel", requestId, relayToken, canceled, canceled ? "" : "Streamer.bot could not cancel and refund the redemption.");
        return canceled;
    }

    private bool Reset(string requestId, string relayToken)
    {
        string rewardId = BoundedId("fanCrownRewardId");
        string rewardTitle = BoundedTitle("fanCrownRewardTitle");
        int rewardCost = BoundedCost("fanCrownRewardCost");
        if (rewardId.Length == 0 || rewardTitle.Length == 0 || rewardCost == 0)
            return Reject("reset", requestId, relayToken, "Reset requires a reward ID, title, and cost.");
        bool updated = CPH.UpdateReward(rewardId, rewardTitle, null, rewardCost, null);
        EmitResult("reset", requestId, relayToken, updated, updated ? "" : "Streamer.bot could not reset the reward.");
        if (updated) CPH.LogInfo("THSV Fan Crown restored the base reward title and cost.");
        return updated;
    }

    private string BoundedId(string name)
    {
        string value = Read(name);
        return value.Length <= 256 ? value : "";
    }

    private string BoundedTitle(string name)
    {
        string value = Read(name);
        return value.Length >= 1 && value.Length <= 45 ? value : "";
    }

    private int BoundedCost(string name)
    {
        int value;
        return CPH.TryGetArg(name, out value) && value >= 1 && value <= MaximumCost ? value : 0;
    }

    private string Read(string name)
    {
        string value;
        return CPH.TryGetArg(name, out value) && value != null ? value.Trim() : "";
    }

    private bool Reject(string operation, string requestId, string relayToken, string reason)
    {
        CPH.LogError("THSV Fan Crown rejected an operation: " + reason);
        if (relayToken.Length >= 20) EmitResult(operation, requestId, relayToken, false, reason);
        return false;
    }

    private void EmitResult(string operation, string requestId, string relayToken, bool success, string error)
    {
        var payload = new Dictionary<string, object>
        {
            ["operation"] = operation,
            ["requestId"] = requestId,
            ["success"] = success,
            ["error"] = error
        };
        var envelope = new Dictionary<string, object>
        {
            ["type"] = "thsv.addon",
            ["version"] = "1.0.0",
            ["moduleId"] = ModuleId,
            ["eventType"] = ResultEvent,
            ["sourceEventType"] = SourceName,
            ["relayId"] = "fan-crown-" + Guid.NewGuid().ToString("N"),
            ["relayToken"] = relayToken,
            ["receivedAt"] = DateTime.UtcNow.ToString("o"),
            ["simulated"] = false,
            ["payload"] = payload
        };
        CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(envelope));
        CPH.SetArgument("fanCrownControllerSuccess", success);
        CPH.SetArgument("fanCrownControllerError", error);
        CPH.SetArgument("fanCrownControllerRequestId", requestId);
    }
}
