# Сборка диаграмм: .dot -> SVG (Graphviz из образа plantuml/plantuml) -> PNG (Edge + шрифт DejaVu Sans),
# .puml -> PNG (PlantUML). Нужны Docker и Node.js; один раз: npm install puppeteer-core в каталоге tools.
# Запуск: powershell -File uml\tools\render.ps1 [часть имени файла]
param([string]$only = "")
$r = $PSScriptRoot
$u = Split-Path $r -Parent
$svg = Join-Path $env:TEMP "cosmodino-uml-svg"
New-Item -ItemType Directory -Force $svg | Out-Null
Get-ChildItem $svg -Filter *.svg | Remove-Item
$dots = Get-ChildItem "$u\src" -Filter "*.dot" | Where-Object { $_.Name -like "*$only*" }
$pumls = Get-ChildItem "$u\src" -Filter "*.puml" | Where-Object { $_.Name -like "*$only*" }
if ($dots) {
  $names = ($dots | ForEach-Object { "src/" + $_.Name }) -join " "
  docker run --rm -v "${u}:/data" -v "${svg}:/svg" -w /data --entrypoint sh plantuml/plantuml:latest -c "for f in $names; do b=`$(basename `$f .dot); dot -Tsvg `$f -o /svg/`$b.svg 2>&1 | grep -v gvplugin_gd; done"
  $env:UML_SRC = "$u\src"
  node "$r\svg2png.js" $svg "$u\png" 2
}
if ($pumls) {
  docker run --rm -v "${u}:/data" -w /data plantuml/plantuml:latest -tpng -charset UTF-8 -o /data/png $pumls.Name.ForEach({ "src/$_" })
}
