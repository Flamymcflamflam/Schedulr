import fs from 'fs';
import http from 'http';
import path from 'path';

const filePath = path.join('public','samples','sample1.txt');
const fileName = path.basename(filePath);
const fileBuffer = fs.readFileSync(filePath);

const boundary = '----WebKitFormBoundary' + Date.now().toString(16);
const delimiter = `--${boundary}`;
const closeDelimiter = `--${boundary}--`;

const header = Buffer.from(
  `${delimiter}\r\n` +
  `Content-Disposition: form-data; name="files"; filename="${fileName}"\r\n` +
  `Content-Type: text/plain\r\n\r\n`
);
const footer = Buffer.from(`\r\n${closeDelimiter}\r\n`);

const body = Buffer.concat([header, fileBuffer, footer]);

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/upload',
  method: 'POST',
  headers: {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try { console.log(JSON.stringify(JSON.parse(data), null, 2)); }
    catch { console.log(data); }
  });
});

req.on('error', (err) => console.error('Request error:', err));
req.write(body);
req.end();
