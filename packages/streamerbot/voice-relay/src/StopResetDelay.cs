// Purpose: Allows an emergency Speaker.bot disable to finish before restoring the TTS engine.
// References: mscorlib.dll, System.dll.
public class CPHInline
{
    public bool Execute()
    {
        CPH.Wait(500);
        return true;
    }
}
