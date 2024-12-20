const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs');
const url = require('url');

const app = express();
const port = 3000;


function getLocalIpAddress() {
  try {
    const interfaces = os.networkInterfaces();

    if (!interfaces || Object.keys(interfaces).length === 0) {
      console.warn('No network interfaces found.');
      return null;
    }

    for (const ifname in interfaces) {
      const ifaceList = interfaces[ifname];
      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }

    console.warn('No IPv4 non-internal address found.');
    return null;
  } catch (error) {
    console.error('Error retrieving local IP address:', error);
    return null;
  }
}

function listRoutes() {
  const routes = [];
  app._router.stack.forEach((middleware) => {
    if (middleware.route) { // Routes registered directly on app
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods).join(', ').toUpperCase()
      });
    } else if (middleware.name === 'router') { // Routes added using a Router
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const routerPath = middleware.regexp.toString().replace('/?(?=\\/|$)/i', ''); // Extract base path
          routes.push({
            path: routerPath + handler.route.path,
            methods: Object.keys(handler.route.methods).join(', ').toUpperCase()
          });
        }
      });
    }
  });
  return routes;
}


function listDir(dirPath) {
  try {
    const items = fs.readdirSync(dirPath);
    const result = [];
    items.forEach(item => {
      const itemPath = path.join(dirPath, item);
      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        result.push(...listDir(itemPath).map(relativePath => path.join(item, relativePath)));
      } else if (stats.isFile()) {
        if (item && item.endsWith('.html')) {
          result.push(item.toString())
        }
      }
    });
    return result;
  } catch (e) {
    return [];
  }
}

function printRoutes() {
  const protocol = "http";
  const hostname = getLocalIpAddress();

  listRoutes().forEach(route => console.log(url.format({ protocol, hostname, port, pathname: route.path })));
  // iterate all files in static folder and add them to the list
  const staticFiles = path.join(__dirname, 'static');
  // iterate staticFiles recursively
  const files = listDir(staticFiles);
  files.forEach(file => console.log(url.format({ protocol, hostname, port, pathname: path.join('/static', file) })));
}

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/a', (req, res) => {
  res.send('Hello World!');
});

app.use('/static', express.static('static'));

app.listen(port, () => {
  console.log(`app is listening at http://${getLocalIpAddress()}:${port}, here are all routes: `);
  printRoutes();
});


