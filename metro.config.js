const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclude the server directory from Metro bundling
const serverPath = path.resolve(__dirname, 'server');
config.resolver.blockList = [
  new RegExp(serverPath.replace(/[/\\]/g, '[/\\\\]') + '.*'),
];

module.exports = config;
