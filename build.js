const fs = require("fs");
const path = require("path");

const root = __dirname;
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");
const buildDir = path.join(root, "build");
const requiredFiles = [
  path.join(root, "server.js"),
  path.join(publicDir, "index.html"),
  path.join(publicDir, "styles.css"),
  path.join(publicDir, "app.js"),
];

for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Missing required file: ${path.relative(root, file)}`);
    process.exit(1);
  }
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });
copyDirectory(publicDir, distDir);
copyDirectory(publicDir, buildDir);

console.log("Build complete. Static assets copied to dist/ and build/.");
console.log("Node production entrypoint: server.js");

function copyDirectory(source, destination) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destinationPath, { recursive: true });
      copyDirectory(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}
