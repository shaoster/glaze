const yaml = require('js-yaml')
const upstreamTransformer = require('@expo/metro-config/babel-transformer')

function isYamlFile(filename) {
  return filename.endsWith('.yml') || filename.endsWith('.yaml')
}

module.exports.transform = function transform({ src, filename, options }) {
  if (isYamlFile(filename)) {
    const parsed = yaml.load(src)
    const jsSource = `module.exports = ${JSON.stringify(parsed)};`
    return upstreamTransformer.transform({
      src: jsSource,
      filename,
      options,
    })
  }

  return upstreamTransformer.transform({ src, filename, options })
}
