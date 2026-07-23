// Purpose: Performs one bounded First Five reward transition requested by the installed add-on.
// Keep this action triggerless. The wizard grants its stable ID only to First Five.
// References: mscorlib.dll, System.dll, System.Core.dll, netstandard.dll, and Newtonsoft.Json.dll.
using System;
using System.Collections.Generic;
using Newtonsoft.Json;

public class CPHInline
{
    private const string ModuleId = "thsv.first-five";
    private const string ResultEvent = "addon.thsv.first-five.controller-result";
    private const string SourceName = "THSV Addon - First Five - Controller";

    public bool Execute()
    {
        string operation = Read("firstFiveOperation").ToLowerInvariant();
        string requestId = Read("firstFiveRequestId");
        string relayToken = Read("thsvAddonRelayToken");
        if (requestId.Length == 0 || requestId.Length > 100) return Reject(operation, requestId, relayToken, "A bounded request ID is required.");
        if (relayToken.Length < 20 || relayToken.Length > 100) return Reject(operation, requestId, relayToken, "The one-use add-on relay token is missing.");

        try
        {
            if (operation == "claim") return Claim(requestId, relayToken);
            if (operation == "cancel") return Cancel(requestId, relayToken);
            if (operation == "reset") return Reset(requestId, relayToken);
            return Reject(operation, requestId, relayToken, "Unsupported First Five operation.");
        }
        catch (Exception error)
        {
            CPH.LogError("THSV First Five controller failed (" + error.GetType().Name + ").");
            EmitResult(operation, requestId, relayToken, false, "Streamer.bot could not complete the reward operation.");
            return false;
        }
    }

    private bool Claim(string requestId, string relayToken)
    {
        string rewardId = BoundedId("firstFiveRewardId");
        string redemptionId = BoundedId("firstFiveRedemptionId");
        string availableTitle = BoundedTitle("firstFiveAvailableTitle");
        string claimedTitle = BoundedTitle("firstFiveClaimedTitle");
        string nextRewardId = OptionalId("firstFiveNextRewardId");
        if (rewardId.Length == 0 || redemptionId.Length == 0 || availableTitle.Length == 0 || claimedTitle.Length == 0)
            return Reject("claim", requestId, relayToken, "Claim requires reward, redemption, available-title, and claimed-title values.");

        if (!CPH.UpdateRewardTitle(rewardId, claimedTitle))
        {
            CPH.TwitchRedemptionCancel(rewardId, redemptionId);
            return Reject("claim", requestId, relayToken, "Streamer.bot could not update the claimed reward title; the redemption was sent for refund.");
        }

        CPH.DisableReward(rewardId);
        bool fulfilled = CPH.TwitchRedemptionFulfill(rewardId, redemptionId);
        if (!fulfilled)
        {
            CPH.UpdateRewardTitle(rewardId, availableTitle);
            CPH.EnableReward(rewardId);
            CPH.TwitchRedemptionCancel(rewardId, redemptionId);
            return Reject("claim", requestId, relayToken, "Streamer.bot could not fulfill the redemption; the current reward was restored and the redemption was sent for refund.");
        }

        string warning = "";
        if (nextRewardId.Length > 0)
        {
            try { CPH.EnableReward(nextRewardId); }
            catch (Exception error)
            {
                warning = "The claim completed, but the next reward could not be enabled (" + error.GetType().Name + ").";
                CPH.LogError("THSV First Five needs reward-state repair: " + warning);
            }
        }
        EmitResult("claim", requestId, relayToken, true, warning);
        CPH.LogInfo("THSV First Five completed one sequential reward claim.");
        return true;
    }

    private bool Cancel(string requestId, string relayToken)
    {
        string rewardId = BoundedId("firstFiveRewardId");
        string redemptionId = BoundedId("firstFiveRedemptionId");
        if (rewardId.Length == 0 || redemptionId.Length == 0)
            return Reject("cancel", requestId, relayToken, "Cancellation requires reward and redemption IDs.");
        bool canceled = CPH.TwitchRedemptionCancel(rewardId, redemptionId);
        EmitResult("cancel", requestId, relayToken, canceled, canceled ? "" : "Streamer.bot could not cancel and refund the redemption.");
        return canceled;
    }

    private bool Reset(string requestId, string relayToken)
    {
        bool titlesUpdated = true;
        for (int index = 1; index <= 5; index++)
        {
            string rewardId = BoundedId("firstFiveReward" + index.ToString() + "Id");
            string title = BoundedTitle("firstFiveReward" + index.ToString() + "Title");
            if (rewardId.Length == 0 || title.Length == 0)
                return Reject("reset", requestId, relayToken, "Reset requires five reward IDs and five available titles.");
            if (!CPH.UpdateRewardTitle(rewardId, title)) titlesUpdated = false;
            if (index == 1) CPH.EnableReward(rewardId);
            else CPH.DisableReward(rewardId);
        }
        EmitResult("reset", requestId, relayToken, titlesUpdated, titlesUpdated ? "" : "One or more reward titles could not be restored.");
        if (titlesUpdated) CPH.LogInfo("THSV First Five restored the five-reward stream chain.");
        return titlesUpdated;
    }

    private string BoundedId(string name)
    {
        string value = Read(name);
        return value.Length <= 256 ? value : "";
    }

    private string OptionalId(string name)
    {
        string value = Read(name);
        return value.Length <= 256 ? value : "";
    }

    private string BoundedTitle(string name)
    {
        string value = Read(name);
        return value.Length >= 1 && value.Length <= 45 ? value : "";
    }

    private string Read(string name)
    {
        string value;
        return CPH.TryGetArg(name, out value) && value != null ? value.Trim() : "";
    }

    private bool Reject(string operation, string requestId, string relayToken, string reason)
    {
        CPH.LogError("THSV First Five rejected an operation: " + reason);
        if (relayToken.Length >= 20) EmitResult(operation, requestId, relayToken, false, reason);
        return false;
    }

    private void EmitResult(string operation, string requestId, string relayToken, bool success, string error)
    {
        string relayId = "first-five-" + Guid.NewGuid().ToString("N");
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
            ["relayId"] = relayId,
            ["relayToken"] = relayToken,
            ["receivedAt"] = DateTime.UtcNow.ToString("o"),
            ["simulated"] = false,
            ["payload"] = payload
        };
        CPH.WebsocketBroadcastJson(JsonConvert.SerializeObject(envelope));
        CPH.SetArgument("firstFiveControllerSuccess", success);
        CPH.SetArgument("firstFiveControllerError", error);
        CPH.SetArgument("firstFiveControllerRequestId", requestId);
    }
}
