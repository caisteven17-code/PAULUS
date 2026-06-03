const http = require('http');

const data = JSON.stringify({
  roles: [
    {
      id: 'bishop',
      name: 'Bishop',
      color: '#D4AF37',
      is_predefined: true,
      permissions: {
        view_diocese: true,
        download_csv: true
      }
    }
  ]
});

const options = {
  hostname: '127.0.0.1',
  port: 4000,
  path: '/api/admin/roles',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  res.on('end', () => {
    console.log('Response:', responseData);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(data);
req.end();
