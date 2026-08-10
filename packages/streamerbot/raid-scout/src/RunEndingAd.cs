// Purpose: Starts one creator-approved Twitch ending ad for Raid Scout.
// Keep this action triggerless. Raid Scout waits for the genuine Twitch Ads > Ad Run trigger
// before using the reported duration; dispatch success alone never authorizes ending a broadcast.
// References: mscorlib.dll, System.dll, System.Core.dll, and netstandard.dll.
using System;

public class CPHInline
{
    public bool Execute()
    {
        object rawDuration;
        int requested = 180;
        if (CPH.TryGetArg("raidScoutAdDurationSeconds", out rawDuration) && rawDuration != null)
            Int32.TryParse(rawDuration.ToString(), out requested);

        int duration = IsAllowedDuration(requested) ? requested : 180;
        bool started = false;
        try { started = CPH.TwitchRunCommercial(duration); }
        catch (Exception exception)
        {
            CPH.LogError("THSV Raid Scout could not request the ending Twitch ad (" + exception.GetType().Name + ").");
            return false;
        }

        if (!started)
        {
            CPH.LogWarn("THSV Raid Scout requested the ending Twitch ad, but Twitch did not accept it. The broadcast will remain live unless a genuine Ad Run event arrives.");
            return false;
        }

        CPH.LogInfo("THSV Raid Scout requested one " + duration.ToString() + " second ending Twitch ad. Waiting for Twitch Ads > Ad Run confirmation.");
        return true;
    }

    private bool IsAllowedDuration(int value)
    {
        return value == 30 || value == 60 || value == 90 || value == 120 || value == 150 || value == 180;
    }
}
