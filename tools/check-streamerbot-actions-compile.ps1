param([Parameter(Mandatory = $true)][string]$StreamerBot, [string]$Packages = '')
# Compiles every THSV Streamer.bot C# action with the Roslyn compiler and libraries bundled in a Streamer.bot
# folder, the way Streamer.bot compiles imported actions. Read-only: nothing in that folder changes.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File tools\check-streamerbot-actions-compile.ps1 -StreamerBot "C:\Streamer.bot"
# Run it against each Streamer.bot version you support (for example the stable 1.0.7 floor and the newest alpha).
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Packages)) { $Packages = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\packages\streamerbot' }
$framework = [System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()
$roslyn = @('System.Runtime.CompilerServices.Unsafe.dll', 'System.Buffers.dll', 'System.Numerics.Vectors.dll', 'System.Memory.dll', 'System.Collections.Immutable.dll', 'System.Reflection.Metadata.dll', 'System.Text.Encoding.CodePages.dll', 'System.Threading.Tasks.Extensions.dll', 'Microsoft.CodeAnalysis.dll', 'Microsoft.CodeAnalysis.CSharp.dll') | Where-Object { Test-Path (Join-Path $StreamerBot $_) } | ForEach-Object { Join-Path $StreamerBot $_ }
foreach ($p in $roslyn) { [void][System.Reflection.Assembly]::LoadFrom($p) }
# Version mismatches (10.0.0.0 asked, 10.0.0.1 shipped) resolve to the copy already loaded; never load inside the handler.
[System.AppDomain]::CurrentDomain.add_AssemblyResolve({ param($s, $e) $n = (New-Object System.Reflection.AssemblyName $e.Name).Name; foreach ($a in [System.AppDomain]::CurrentDomain.GetAssemblies()) { if ($a.GetName().Name -eq $n) { return $a } }; return $null })
$harness = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
public static class ThsvCompileCheck
{
    public static string[] Run(string streamerBot, string packages, string framework)
    {
        var paths = new List<string>();
        foreach (var name in new[] { "mscorlib.dll", "System.dll", "System.Core.dll", "System.Net.Http.dll", "System.Xml.dll", "System.Drawing.dll", "System.Windows.Forms.dll", "Microsoft.CSharp.dll" })
            if (File.Exists(Path.Combine(framework, name))) paths.Add(Path.Combine(framework, name));
        if (Directory.Exists(Path.Combine(framework, "Facades"))) paths.AddRange(Directory.GetFiles(Path.Combine(framework, "Facades"), "*.dll"));
        if (File.Exists(Path.Combine(framework, "netstandard.dll"))) paths.Add(Path.Combine(framework, "netstandard.dll"));
        paths.AddRange(Directory.GetFiles(streamerBot, "*.dll").Where(p => !Path.GetFileName(p).StartsWith("Microsoft.CodeAnalysis") && !Path.GetFileName(p).StartsWith("System.")));
        var refs = new List<MetadataReference>();
        foreach (var p in paths) { try { System.Reflection.AssemblyName.GetAssemblyName(p); refs.Add(MetadataReference.CreateFromFile(p)); } catch { } }
        var output = new List<string>(); int count = 0, failed = 0;
        foreach (var file in Directory.GetFiles(packages, "*.cs", SearchOption.AllDirectories))
        {
            count++;
            var code = System.Text.RegularExpressions.Regex.Replace(File.ReadAllText(file), @"public class CPHInline\b(?!\s*:)", "public class CPHInline : Streamer.bot.Plugin.Interface.CPHInlineBase");
            var compilation = CSharpCompilation.Create("thsv" + count, new[] { CSharpSyntaxTree.ParseText(code) }, refs, new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
            using (var stream = new MemoryStream())
            {
                var result = compilation.Emit(stream);
                if (!result.Success) { failed++; output.Add("FAIL " + file.Substring(packages.Length + 1) + ": " + string.Join(" | ", result.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).Take(3).Select(d => d.ToString()))); }
            }
        }
        output.Add("Compiled " + count + " actions, " + failed + " failed.");
        return output.ToArray();
    }
}
'@
$references = $roslyn + @((Join-Path $framework 'netstandard.dll'), 'System.Core.dll', 'System.dll')
Add-Type -TypeDefinition $harness -ReferencedAssemblies $references -Language CSharp -IgnoreWarnings
$report = [ThsvCompileCheck]::Run($StreamerBot, (Resolve-Path $Packages).Path, $framework)
$report
if ($report[-1] -notmatch ' 0 failed') { exit 1 }
