const solcjs = require('solc-js')

onmessage = async e => {
  const sourcecode = e.data
  const compiler = await solcjs()
  const result = await compiler(sourcecode)
  console.log('1. worker result:', result)
  postMessage(result)
}
