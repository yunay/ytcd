# Renders the YTCD app mark (blue rounded tile, glossy top, white download
# arrow) at every icon size and packs them into one .ico with PNG entries.
# Geometry follows the 16x16 SVG in src/index.html, scaled per size.
param(
    [Parameter(Mandatory = $true)][string]$OutIco,
    [Parameter(Mandatory = $true)][string]$OutPreview
)

Add-Type -AssemblyName System.Drawing

function New-RoundedRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = 2 * $r
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Render-Mark([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    # Blend in sRGB like the browser does for the SVG mark. HighQuality is
    # gamma-corrected: the 22% white gloss then reads as ~45% and washes the
    # tile out (lavender on blue, pink on red).
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::AssumeLinear
    $g.Clear([System.Drawing.Color]::Transparent)

    $k = $size / 16.0
    $r = 4 * $k

    # tile: #1F5FC4 easing to #003E92 towards the bottom-right corner
    $tile = New-RoundedRect 0 0 $size $size $r
    $grad = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF(0, 0)),
        (New-Object System.Drawing.PointF($size, $size)),
        [System.Drawing.Color]::FromArgb(255, 31, 95, 196),
        [System.Drawing.Color]::FromArgb(255, 0, 62, 146))
    $g.FillPath($grad, $tile)

    # gloss: the top half, white at 22%
    $shine = New-RoundedRect 0 0 $size ($size / 2) $r
    $shineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(56, 255, 255, 255))
    $g.FillPath($shineBrush, $shine)

    # download arrow
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [single](1.7 * $k))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $g.DrawLine($pen, [single](8 * $k), [single](3.6 * $k), [single](8 * $k), [single](9.6 * $k))
    $chevron = [System.Drawing.PointF[]]@(
        (New-Object System.Drawing.PointF([single](5.3 * $k), [single](7.1 * $k))),
        (New-Object System.Drawing.PointF([single](8 * $k), [single](9.8 * $k))),
        (New-Object System.Drawing.PointF([single](10.7 * $k), [single](7.1 * $k))))
    $g.DrawLines($pen, $chevron)
    $g.DrawLine($pen, [single](4.6 * $k), [single](12.3 * $k), [single](11.4 * $k), [single](12.3 * $k))

    $g.Dispose()
    return $bmp
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngs = @()
$bitmaps = @()
foreach ($s in $sizes) {
    $bmp = Render-Mark $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs += , $ms.ToArray()
    $bitmaps += $bmp
}

# ICONDIR + one ICONDIRENTRY per size, then the PNG payloads
$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($out)
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $w.Write([byte]$dim); $w.Write([byte]$dim)
    $w.Write([byte]0); $w.Write([byte]0)
    $w.Write([UInt16]1); $w.Write([UInt16]32)
    $w.Write([UInt32]$pngs[$i].Length); $w.Write([UInt32]$offset)
    $offset += $pngs[$i].Length
}
foreach ($p in $pngs) { $w.Write($p) }
$w.Flush()
[System.IO.File]::WriteAllBytes($OutIco, $out.ToArray())

# Preview: every size on a dark and a light strip
$pw = 0; foreach ($s in $sizes) { $pw += $s + 24 }
# computed first: inside an argument list the comma binds before *
$ph = 2 * (256 + 24)
$preview = New-Object System.Drawing.Bitmap($pw, $ph)
$pg = [System.Drawing.Graphics]::FromImage($preview)
$pg.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 28, 28, 33))), 0, 0, $pw, 280)
$pg.FillRectangle((New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 243, 243, 243))), 0, 280, $pw, 280)
$x = 12
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $pg.DrawImageUnscaled($bitmaps[$i], $x, 12)
    $pg.DrawImageUnscaled($bitmaps[$i], $x, 292)
    $x += $sizes[$i] + 24
}
$preview.Save($OutPreview, [System.Drawing.Imaging.ImageFormat]::Png)
"wrote $OutIco ($($out.Length) bytes, sizes: $($sizes -join ', '))"
