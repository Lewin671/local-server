const express = require('express');
const os = require('os');
const path = require('path');
const fs = require('fs');
const url = require('url');

const app = express();
app.set('etag', false);
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

app.get("/stream/referrer-test", async (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  // read file sync
  const html = fs.readFileSync(path.join(__dirname, 'stream/referrer-test.html'), 'utf8');
  res.send(html);
})

app.get("/stream/slow-stream", async (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');

  // 开始流式输出
  res.write('<html><head><title>Slow Stream</title></head><body>');

  // 模拟慢速流，每隔一定时间发送一部分 HTML
  const parts = [
    '<h1>Welcome to the Slow Stream</h1>',
    '<p>This content is being sent slowly...</p>',
    '<p>We are simulating a slow network...</p>',
    '<p>Enjoy the stream!</p>'
  ];
  // write 10000 次 parts[0]
  for (let i = 0; i < 10000; i++) {
    res.write(parts[0]);
  }

  // 使用 async/await 模拟慢速流
  for (const part of parts) {
    res.write(part);
    await new Promise(resolve => setTimeout(resolve, 2000)); // 每部分之间延迟 2 秒
  }

  // 添加一个 <script> 来计算 FCP 和 FP
  const script = `
    <script>
      // 用于计算 First Contentful Paint (FCP)
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list, observer) => {
          const entries = list.getEntries();
          for (const entry of entries) {
            if (entry.entryType === 'paint' && entry.name === 'first-contentful-paint') {
              console.log('FCP:', entry.startTime, 'ms');
            }
          }
        });
        observer.observe({ type: 'paint', buffered: true });
      }
      
      // 用于计算 First Paint (FP)
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list, observer) => {
          const entries = list.getEntries();
          for (const entry of entries) {
            if (entry.entryType === 'paint' && entry.name === 'first-paint') {
              console.log('FP:', entry.startTime, 'ms');
            }
          }
        });
        observer.observe({ type: 'paint', buffered: true });
      }

      var a = 0;
      for(let i = 0; i < 100000000; i++) {
      a = a + 1;
    }
      console.log('a:', a);
    </script>
  `;

  // 输出结束前，添加 script 内容
  res.write(script);

  // 完成流式输出
  res.write('</body></html>');
  res.end();
});

app.get("/stream/scanAndPreload", async (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");

  const part1 = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ScanAndPreloadTest</title>
    </head>
    <script>
        for(let i = 0; i < 10000; i++) {
            console.log(i);
        }
    </script>
  `;

  const part2 = `
    <body>
      <img src="https://www.baidu.com/img/flexible/logo/plus_logo_web_2.png" alt="Example Image">
    </body>
    </html>
  `;

  res.write(part1);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  res.write(part2);
  res.end();
});


app.use('/static', express.static('static'));

app.listen(port, () => {
  console.log(`app is listening at http://${getLocalIpAddress()}:${port}, here are all routes: `);
  printRoutes();
});


