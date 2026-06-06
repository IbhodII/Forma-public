const path = require('path');
const {getDefaultConfig} = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const sharedRoot = path.join(workspaceRoot, 'shared');

function blockDir(name) {
  const segment = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `${workspaceRoot.replace(/\\/g, '/')}[/\\\\]${segment}[/\\\\].*`,
  );
}

/**
 * Metro для EAS Build (expo export:embed) и локального RN.
 * Watch only mobile + shared/i18n; block desktop/backend to avoid cross-platform resolves.
 * @see https://docs.expo.dev/guides/customizing-metro/
 */
const config = getDefaultConfig(projectRoot);
config.watchFolders = [sharedRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.blockList = [
  blockDir('frontend'),
  blockDir('backend'),
  blockDir('e2e'),
  blockDir('venv'),
  blockDir('archive'),
];

module.exports = config;
