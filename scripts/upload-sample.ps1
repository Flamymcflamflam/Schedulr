param()
$uri = 'http://localhost:3000/api/upload'
$path = Join-Path $PSScriptRoot '..\public\samples\sample1.txt'

Write-Output "Uploading $path to $uri..."

$client = New-Object System.Net.Http.HttpClient
$content = New-Object System.Net.Http.MultipartFormDataContent
$fileStream = [System.IO.File]::OpenRead($path)
$fileContent = New-Object System.Net.Http.StreamContent($fileStream)
$fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('text/plain')
$content.Add($fileContent, 'files', [System.IO.Path]::GetFileName($path))

try {
    $resp = $client.PostAsync($uri, $content).Result
    $body = $resp.Content.ReadAsStringAsync().Result
    Write-Output "Status: $($resp.StatusCode)"
    Write-Output "Response:" 
    Write-Output $body
} catch {
    Write-Error $_.Exception.Message
} finally {
    $fileStream.Dispose()
    $client.Dispose()
}
