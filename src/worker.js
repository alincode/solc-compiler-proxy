// const v = require('solc-version')

onmessage = async e => {
  const result = e.data

  let version = 'stable'
  // let version = 'latest';
  // let url = await v.version2url(version)
  // console.log('1. worker result:', url)
  postMessage(result)
}
