const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

config.transformer = {
  ...config.transformer,
  babelTransformerPath: path.resolve(__dirname, 'yamlTransformer.cjs'),
}

config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'yml' && ext !== 'yaml'),
  sourceExts: [...config.resolver.sourceExts, 'yml', 'yaml'],
}

config.watchFolders = [
  path.resolve(__dirname, '..'),
  path.resolve(__dirname, '../frontend_common'),
]

module.exports = config
